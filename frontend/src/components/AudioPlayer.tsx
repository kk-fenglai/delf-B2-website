import { useEffect, useRef, useState } from 'react';
import { Button, Slider, Tag, Space } from 'antd';
import { PlayCircleFilled, PauseCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Real audio URL — if missing/invalid, component falls back to browser TTS */
  audioUrl?: string;
  /** Text to synthesize when falling back to TTS (e.g. listening transcript) */
  transcript?: string;
  /** Max plays allowed (simulates DELF exam rules). 0 = unlimited */
  maxPlays?: number;
}

function isPlaceholderUrl(url?: string) {
  if (!url) return true;
  return /example\.com|placeholder|demo-co/.test(url);
}

export default function AudioPlayer({ audioUrl, transcript, maxPlays = 0 }: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [playCount, setPlayCount] = useState(0);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [frenchVoice, setFrenchVoice] = useState<SpeechSynthesisVoice | null>(null);

  const useTTS = isPlaceholderUrl(audioUrl);

  // Find French voice
  useEffect(() => {
    if (!useTTS) return;
    if (!('speechSynthesis' in window)) {
      setTtsSupported(false);
      return;
    }
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      const fr = voices.find((v) => v.lang.startsWith('fr')) || voices[0];
      setFrenchVoice(fr || null);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [useTTS]);

  // Clean up TTS on unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const atPlayLimit = maxPlays > 0 && playCount >= maxPlays;

  const play = () => {
    if (atPlayLimit) return;

    if (useTTS) {
      if (!transcript) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(transcript);
      utter.lang = 'fr-FR';
      if (frenchVoice) utter.voice = frenchVoice;
      utter.rate = rate;
      utter.onstart = () => setIsPlaying(true);
      utter.onend = () => {
        setIsPlaying(false);
        setPlayCount((c) => c + 1);
      };
      utter.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utter);
    } else {
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
        audioRef.current.play();
      }
    }
  };

  const pause = () => {
    if (useTTS) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      audioRef.current?.pause();
    }
  };

  const reset = () => {
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setPlayCount(0);
  };

  // ---------- Real audio mode ----------
  if (!useTTS) {
    return (
      <div className="bg-gray-50 p-3 rounded mb-4">
        <audio
          ref={audioRef}
          src={audioUrl}
          controls
          className="w-full"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setPlayCount((c) => c + 1); }}
        >
          {t('exam.audioNotSupported')}
        </audio>
      </div>
    );
  }

  // ---------- TTS fallback ----------
  if (!ttsSupported) {
    return (
      <div className="bg-yellow-50 text-yellow-800 p-3 rounded mb-4 text-sm">
        ⚠️ {t('exam.audioNotSupported')}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg mb-4 border border-blue-100">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <Tag color="blue">🎧 TTS · fr-FR {frenchVoice ? `(${frenchVoice.name})` : ''}</Tag>
        {maxPlays > 0 && (
          <Tag color={atPlayLimit ? 'red' : 'default'}>
            {playCount}/{maxPlays}
          </Tag>
        )}
      </div>

      <Space size="middle" className="mb-3">
        {!isPlaying ? (
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleFilled />}
            onClick={play}
            disabled={atPlayLimit || !transcript}
          >
            Play
          </Button>
        ) : (
          <Button size="large" icon={<PauseCircleFilled />} onClick={pause}>
            Pause
          </Button>
        )}
        <Button icon={<ReloadOutlined />} onClick={reset}>
          Reset
        </Button>
      </Space>

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 whitespace-nowrap">Speed {rate}×</span>
        <Slider
          min={0.5}
          max={1.5}
          step={0.25}
          value={rate}
          onChange={(v) => setRate(v as number)}
          marks={{ 0.5: '0.5', 0.75: '0.75', 1: '1', 1.25: '1.25', 1.5: '1.5' }}
          className="flex-1"
        />
      </div>

      {!transcript && (
        <div className="text-xs text-red-500 mt-2">No transcript available for TTS.</div>
      )}
    </div>
  );
}
