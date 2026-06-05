import { useEffect, useRef, useState } from 'react';
import { Button, Slider, Tag, Space, Progress, Alert } from 'antd';
import { PlayCircleFilled, PauseCircleFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Signed audio URL (e.g. /api/audio/fei/xxx.mp3?t=...). When empty,
   *  the listening question can't be played and we show a placeholder. */
  audioUrl?: string | null;
  /** Max plays allowed (DELF rule = 2). 0 means unlimited. */
  maxPlays?: number;
  /** Controlled play counter — owned by the parent so the value survives
   *  question-to-question navigation. */
  playCount?: number;
  /** Called once per fresh listen (when a play starts from currentTime≈0).
   *  Pause/resume within a play does NOT trigger this. */
  onPlayStart?: () => void;
}

function fmtTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Listening-exam audio player.
 *
 * Deliberately does NOT use `<audio controls>` — native controls expose a seek
 * bar and re-play buttons that bypass the DELF "listen twice" rule. Instead
 * we render our own Play / Pause buttons and a read-only progress bar.
 *
 * Replay enforcement: a "play" is counted exactly when playback starts from
 * the beginning of the clip (currentTime ≈ 0). Pause and resume mid-clip is
 * one play. Once `playCount >= maxPlays`, the Play button is disabled.
 */
export default function AudioPlayer({
  audioUrl,
  maxPlays = 0,
  playCount = 0,
  onPlayStart,
}: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Used by handlePlay to know whether this play() invocation should count
  // as a new listen (currentTime≈0) or just a resume.
  const newPlayRef = useRef(false);

  const atLimit = maxPlays > 0 && playCount >= maxPlays;

  // Hard-stop audio on unmount — prevents the clip continuing to play after
  // the runner advances sections or auto-submits.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        try { el.pause(); } catch { /* ignore */ }
        el.src = '';
      }
    };
  }, []);

  // Reset transport state when the audio source changes (e.g. parent passes
  // a fresh URL for a new question). Also tells the element to reload so its
  // internal currentTime resets.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    const el = audioRef.current;
    if (el) {
      try { el.pause(); el.currentTime = 0; el.load(); } catch { /* ignore */ }
    }
  }, [audioUrl]);

  const handlePlay = () => {
    const el = audioRef.current;
    if (!el || atLimit) return;
    // A play that begins at (or very near) the start counts as one new listen.
    if (el.currentTime <= 0.25) {
      newPlayRef.current = true;
    }
    el.playbackRate = rate;
    void el.play().catch(() => { /* user gesture / autoplay errors are non-fatal */ });
  };

  const handlePause = () => {
    audioRef.current?.pause();
  };

  // No audio source → show a clear placeholder. We deliberately do NOT fall
  // back to browser TTS: previously the recording transcript shipped to the
  // client to feed TTS, which leaked the answer to anyone with DevTools.
  if (!audioUrl) {
    return (
      <Alert
        type="warning"
        showIcon
        className="mb-4"
        message={t('exam.audioNotUploaded')}
      />
    );
  }

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg mb-4 border border-blue-100">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Tag color="blue">🎧 Audio</Tag>
        <Tag color={atLimit ? 'red' : 'default'}>
          {maxPlays > 0
            ? t('exam.audioPlays', { used: playCount, max: maxPlays })
            : t('exam.audioPlaysUnlimited')}
        </Tag>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        // Do NOT pass `controls` — we render our own to enforce maxPlays.
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          if (newPlayRef.current) {
            newPlayRef.current = false;
            onPlayStart?.();
          }
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration || 0)}
        onRateChange={(e) => setRate((e.target as HTMLAudioElement).playbackRate)}
      >
        {t('exam.audioNotSupported')}
      </audio>

      <Space size="middle" className="mb-3">
        {!isPlaying ? (
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleFilled />}
            onClick={handlePlay}
            disabled={atLimit}
          >
            {t('exam.audioPlay')}
          </Button>
        ) : (
          <Button size="large" icon={<PauseCircleFilled />} onClick={handlePause}>
            {t('exam.audioPause')}
          </Button>
        )}
        <span className="text-xs text-gray-500 tabular-nums">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
      </Space>

      {/* Read-only progress — no seek bar so candidates can't scrub past parts
          they want to re-hear without using a replay. */}
      <Progress percent={pct} showInfo={false} size="small" className="mb-3" />

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {t('exam.audioSpeed')} {rate}×
        </span>
        <Slider
          min={0.75}
          max={1.25}
          step={0.25}
          value={rate}
          onChange={(v) => {
            const r = v as number;
            setRate(r);
            if (audioRef.current) audioRef.current.playbackRate = r;
          }}
          marks={{ 0.75: '0.75', 1: '1', 1.25: '1.25' }}
          className="flex-1"
        />
      </div>

      {atLimit && (
        <div className="text-xs text-red-500 mt-2">{t('exam.audioPlayLimitReached')}</div>
      )}
    </div>
  );
}
