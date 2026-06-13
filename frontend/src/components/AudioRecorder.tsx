import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Progress, Space, Tag, Typography } from 'antd';
import {
  AudioOutlined,
  StopOutlined,
  ReloadOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// MIME types we'll try, in priority order. The first one MediaRecorder.isTypeSupported
// returns true for is what we record with. webm/opus is universal on Chrome/Firefox;
// mp4/aac is the Safari fallback (Safari ≥ 14.1 supports MediaRecorder).
const MIME_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

function pickSupportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME_PREFERENCES) {
    try {
      // Safari < 14.1 lacks isTypeSupported — guard with a runtime check.
      const fn = (MediaRecorder as unknown as { isTypeSupported?: (m: string) => boolean }).isTypeSupported;
      if (fn && fn(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return ''; // empty string lets the browser pick its default
}

type Phase = 'idle' | 'recording' | 'recorded';

export interface RecordingResult {
  blob: Blob;
  durationSec: number;
  mimeType: string;
}

type Props = {
  // Hard ceiling — when reached, recording auto-stops.
  maxSeconds: number;
  // Called once when the user finalises a take. The component does NOT auto-upload.
  onComplete: (result: RecordingResult) => void;
  // When true, the recording UI is locked (e.g. while a parent is uploading).
  disabled?: boolean;
  // After completion, can the student record again? false = single take (exam mode).
  allowRetake?: boolean;
  // Optional label shown above the recorder (e.g. "Question 1 / 4").
  label?: string;
};

/**
 * Browser-only audio recorder backed by MediaRecorder. Renders:
 *   - mic permission gate
 *   - record / stop button
 *   - real-time waveform (AnalyserNode mean RMS)
 *   - hard countdown that auto-stops at maxSeconds
 *   - replay + retake (if allowRetake)
 *
 * Why no upload here: keeps the component reusable for both monologue and
 * each follow-up answer. The parent decides whether and where to POST.
 */
export default function AudioRecorder({
  maxSeconds,
  onComplete,
  disabled = false,
  allowRetake = false,
  label,
}: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  // null = OK; 'insecure' = page not served over HTTPS (mic blocked by browser);
  // 'browser' = MediaRecorder/getUserMedia missing (browser too old).
  const [blocker, setBlocker] = useState<null | 'insecure' | 'browser'>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [level, setLevel] = useState(0); // 0..1, instantaneous RMS
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [finalDur, setFinalDur] = useState<number>(0);
  const [finalMime, setFinalMime] = useState<string>('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Feature detect once on mount — show a clear message instead of silently
    // appearing broken on iOS < 14.1 or older Edge.
    if (typeof window === 'undefined') return;
    // Browsers expose `navigator.mediaDevices` ONLY in a secure context
    // (HTTPS or localhost). Testing on a phone over http://<LAN-ip>:port hits
    // this — the mic API is simply absent, which otherwise looks like a bug.
    if (window.isSecureContext === false) {
      setBlocker('insecure');
      return;
    }
    const hasMR = typeof window.MediaRecorder !== 'undefined';
    const hasGUM = !!navigator.mediaDevices?.getUserMedia;
    if (!hasMR || !hasGUM) setBlocker('browser');
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup if the component unmounts mid-recording.
      cleanupRecording();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupRecording() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    rafRef.current = null;
    tickTimerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }

  function startMeter(stream: MediaStream) {
    try {
      // Some browsers prefix AudioContext.
      // @ts-expect-error: webkitAudioContext on legacy WebKit
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Empirical scaling — typical voice peaks at 0.1-0.3 RMS.
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* meter is cosmetic; ignore failures */
    }
  }

  async function start() {
    setError(null);
    if (blocker) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          // Disable the more aggressive browser DSP — leaves the LLM with a
          // cleaner signal, and STT generally prefers raw mic audio.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      // Surface the real cause so the student knows what to fix.
      const name = (err as DOMException)?.name;
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError(t('oral.recorder.noDevice'));
      } else {
        // NotAllowedError / SecurityError / PermissionDeniedError, etc.
        setError(t('oral.recorder.permissionDenied'));
      }
      return;
    }
    streamRef.current = stream;

    const mime = pickSupportedMime();
    let mr: MediaRecorder;
    try {
      mr = mime
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
    } catch (err) {
      setError(t('oral.recorder.mimeUnsupported'));
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    recorderRef.current = mr;
    chunksRef.current = [];
    setElapsedSec(0);
    startedAtRef.current = Date.now();

    mr.addEventListener('dataavailable', (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    });
    mr.addEventListener('stop', () => {
      const recordedMime = mr.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: recordedMime });
      const dur = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setFinalDur(dur);
      setFinalMime(recordedMime);
      setPhase('recorded');
      // Tear down stream/analyser; keep the blob alive in state.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* ignore */ }
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;

      onComplete({ blob, durationSec: dur, mimeType: recordedMime });
    });

    mr.start(500); // 500ms timeslices keep memory bounded
    setPhase('recording');
    startMeter(stream);

    tickTimerRef.current = window.setInterval(() => {
      const e = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSec(e);
      if (e >= maxSeconds) stop();
    }, 200);
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
  }

  function retake() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setFinalDur(0);
    setFinalMime('');
    setPhase('idle');
  }

  if (blocker) {
    return (
      <Alert
        type="error"
        showIcon
        message={t(blocker === 'insecure' ? 'oral.recorder.insecureTitle' : 'oral.recorder.unsupportedTitle')}
        description={t(blocker === 'insecure' ? 'oral.recorder.insecureDesc' : 'oral.recorder.unsupportedDesc')}
      />
    );
  }

  const remaining = Math.max(0, maxSeconds - elapsedSec);
  const pct = Math.min(100, Math.round((elapsedSec / maxSeconds) * 100));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="audio-recorder">
      {label && <Text strong className="block mb-2">{label}</Text>}

      {error && <Alert type="error" showIcon message={error} className="mb-3" />}

      {phase === 'idle' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            size="large"
            icon={<AudioOutlined />}
            onClick={start}
            disabled={disabled}
          >
            {t('oral.recorder.start')}
          </Button>
          <Text type="secondary" className="text-xs">
            {t('oral.recorder.maxLengthHint', { sec: maxSeconds })}
          </Text>
        </Space>
      )}

      {phase === 'recording' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div className="flex items-center justify-between">
            <Tag color="red">● {t('oral.recorder.recording')}</Tag>
            <Text strong>
              {String(Math.floor(elapsedSec / 60)).padStart(1, '0')}:
              {String(elapsedSec % 60).padStart(2, '0')}
              {' / '}
              <Text type="secondary">
                {String(minutes).padStart(1, '0')}:{String(seconds).padStart(2, '0')}{' '}
                {t('oral.recorder.remaining')}
              </Text>
            </Text>
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            status={remaining < 10 ? 'exception' : 'active'}
            strokeColor={remaining < 10 ? '#ff4d4f' : '#1677ff'}
          />
          <div
            className="h-3 rounded-full bg-gray-200 overflow-hidden"
            aria-hidden
          >
            <div
              className="h-full bg-green-500 transition-[width] duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
          <Button danger icon={<StopOutlined />} onClick={stop}>
            {t('oral.recorder.stop')}
          </Button>
        </Space>
      )}

      {phase === 'recorded' && blobUrl && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div className="flex items-center gap-2">
            <CheckCircleFilled style={{ color: '#52c41a' }} />
            <Text strong>{t('oral.recorder.recorded')}</Text>
            <Text type="secondary">
              {finalDur}s {finalMime && `· ${finalMime.split(';')[0]}`}
            </Text>
          </div>
          <audio src={blobUrl} controls preload="metadata" style={{ width: '100%' }} />
          {allowRetake && (
            <Button icon={<ReloadOutlined />} onClick={retake} disabled={disabled}>
              {t('oral.recorder.retake')}
            </Button>
          )}
        </Space>
      )}
    </div>
  );
}
