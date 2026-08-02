// Runner for the DELF B2 Compréhension de l'Oral section in full-mock mode.
//
// Behaviour (per product decision — relaxed from the strict DELF timeline):
//   - Audio NEVER auto-plays. The candidate clicks "Play" to start each
//     listening, so nothing blasts out on entering the section.
//   - Play count is still capped per document (Ex.1/Ex.2 long = 2 plays,
//     Ex.3 short = 1). Once the cap is reached the Play button disappears.
//   - Answers for the CURRENT document are editable at ALL times — including
//     while the audio is playing — so candidates can answer as they listen.
//   - A soft read-time hint counts down before the first play but does NOT
//     force playback; it's purely informational.
//   - Documents are shown one at a time; past documents become read-only.
//
// Per-document phase (no forced timers):
//   IDLE (Play button shown) --click--> PLAYING --audio end-->
//        if plays left: back to IDLE (next play)
//        else:          AFTER (Play hidden, "next document" button)
//
// For the free-playback practice version see CoSectionRunner.tsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Steps, Tag, Typography } from 'antd';
import { ClockCircleOutlined, PlayCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AudioDocument, Question } from '../types';

const { Title, Paragraph } = Typography;

type Phase = 'IDLE' | 'PLAYING' | 'AFTER';

interface Props {
  /** All AudioDocuments for the CO section, in display order. */
  documents: AudioDocument[];
  /** All CO questions; we group them by audioDocumentId locally. */
  questions: Question[];
  /** Renders the answer input for one question. Provided by the parent so
   *  this component stays input-type-agnostic. */
  renderAnswer: (q: Question, locked: boolean) => React.ReactNode;
  /** Fires when every document has finished. The parent then submits or
   *  advances to the next section. */
  onComplete: () => void;
  /** Pretty section header (skill name) — passed through so the parent
   *  controls labels / i18n. */
  headerExtra?: React.ReactNode;
}

export default function CoSectionRunnerMock({
  documents,
  questions,
  renderAnswer,
  onComplete,
  headerExtra,
}: Props) {
  const { t } = useTranslation();

  // Stable list of (doc, its questions) tuples. Questions without a doc
  // (legacy CO rows before backfill) get bucketed under a synthetic "no
  // document" entry that gives them a single play (safer default than
  // unlimited replays).
  const groups = useMemo(() => {
    const byDoc = new Map<string, Question[]>();
    for (const q of questions) {
      const key = q.audioDocumentId || '__orphan__';
      if (!byDoc.has(key)) byDoc.set(key, []);
      byDoc.get(key)!.push(q);
    }
    const ordered: Array<{ doc: AudioDocument; qs: Question[] }> = [];
    for (const d of documents) {
      const qs = byDoc.get(d.id) || [];
      if (qs.length === 0) continue;
      ordered.push({ doc: d, qs });
    }
    const orphans = byDoc.get('__orphan__') || [];
    if (orphans.length > 0) {
      ordered.push({
        doc: {
          id: '__orphan__', order: ordered.length, title: null, audioUrl: null,
          maxPlays: 1, prepSeconds: 30, gapSeconds: 0, answerSeconds: 60,
        },
        qs: orphans,
      });
    }
    return ordered;
  }, [documents, questions]);

  const [docIdx, setDocIdx] = useState(0);
  const first = groups[0];
  const [phase, setPhase] = useState<Phase>(first && first.doc.audioUrl ? 'IDLE' : 'AFTER');
  const [playsDone, setPlaysDone] = useState(0);
  const [remaining, setRemaining] = useState(first ? first.doc.prepSeconds : 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const current = groups[docIdx];

  // Reset per-document state whenever we move to a new document. Skips the
  // initial mount (state is already seeded from groups[0] above).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const c = groups[docIdx];
    if (!c) return;
    setPlaysDone(0);
    setPhase(c.doc.audioUrl ? 'IDLE' : 'AFTER');
    setRemaining(c.doc.prepSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docIdx]);

  // Soft read-time hint: counts down while waiting to play, then stops.
  // Purely informational — it never triggers playback.
  useEffect(() => {
    if (phase !== 'IDLE' || remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [phase, remaining]);

  // Hard-stop audio on unmount.
  useEffect(() => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
  }, []);

  if (!current) {
    return <Alert type="info" message={t('exam.coPhaseDone')} showIcon />;
  }

  const isLastDoc = docIdx >= groups.length - 1;
  const playsLeft = current.doc.maxPlays - playsDone;

  function startPlay() {
    const el = audioRef.current;
    if (!el || !current.doc.audioUrl) return;
    setPhase('PLAYING');
    try { el.currentTime = 0; el.play().catch(() => { /* gesture issues non-fatal */ }); } catch { /* ignore */ }
  }

  function onAudioEnded() {
    const next = playsDone + 1;
    setPlaysDone(next);
    setPhase(next < current.doc.maxPlays ? 'IDLE' : 'AFTER');
    setRemaining(current.doc.gapSeconds);
  }

  function advanceDoc() {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    if (isLastDoc) onComplete();
    else setDocIdx(docIdx + 1);
  }

  const hint =
    phase === 'PLAYING'
      ? t('exam.coPhasePlay')
      : playsDone === 0
        ? t('exam.coPhasePrep')
        : phase === 'IDLE'
          ? t('exam.coPhaseGap')
          : '';

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <Title level={4} className="!mb-0">
          {t('exam.coDocLabel', { n: docIdx + 1, total: groups.length })}
          {current.doc.title ? <span className="ml-2 text-muted">{current.doc.title}</span> : null}
        </Title>
        {headerExtra}
      </div>

      <Steps
        current={docIdx}
        size="small"
        className="mb-3"
        items={groups.map((g, i) => ({
          title: g.doc.title || `Doc ${i + 1}`,
          description: t('exam.coDocPlaysRule', { n: g.doc.maxPlays }),
          status: i < docIdx ? 'finish' : i === docIdx ? 'process' : 'wait',
        }))}
      />

      <Alert type="info" showIcon className="mb-3" message={t('exam.coReadyHint')} />

      {/* Hidden audio element — playback is driven only by the Play button. */}
      <audio
        key={current.doc.id}
        ref={audioRef}
        src={current.doc.audioUrl || undefined}
        preload="auto"
        onEnded={onAudioEnded}
      />

      {current.doc.audioUrl ? (
        <div className="bg-surface-container-lowest rounded-xl p-5 shadow-level-1 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-caps uppercase text-on-surface-variant inline-flex items-center gap-1.5">
              <SoundOutlined /> Document Sonore
            </span>
            <span className="text-label-caps uppercase px-2 py-0.5 rounded text-primary bg-primary-container/10 tabular-nums">
              {t('exam.coPlayBtn', { n: Math.min(playsDone + 1, current.doc.maxPlays), total: current.doc.maxPlays })}
            </span>
          </div>
          <div className="flex items-center flex-wrap gap-3">
            <span className="text-sm text-on-surface-variant">{hint}</span>
            {phase === 'IDLE' && remaining > 0 && (
              <span className="text-xs tabular-nums text-on-surface-variant">
                <ClockCircleOutlined /> {t('exam.coCountdownHint', { sec: remaining })}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted">
                {playsDone} / {current.doc.maxPlays}
              </span>
              {phase === 'PLAYING' ? (
                <Tag color="orange">{t('exam.coPlaying')}</Tag>
              ) : playsLeft > 0 ? (
                <Button type="primary" shape="round" icon={<PlayCircleOutlined />} onClick={startPlay}>
                  {t('exam.coPlayBtn', { n: playsDone + 1, total: current.doc.maxPlays })}
                </Button>
              ) : null}
            </span>
          </div>
        </div>
      ) : (
        <Alert type="warning" showIcon className="mb-3" message={t('exam.audioNotUploaded')} />
      )}

      <Card bordered={false} className="app-surface">
        {current.qs.map((q, qi) => (
          <div key={q.id} className={qi > 0 ? 'mt-5 pt-5 border-t' : ''}>
            <div className="text-label-caps uppercase text-on-surface-variant mb-1">
              Question {qi + 1}
            </div>
            <Paragraph className="text-base font-semibold mb-3">
              {q.prompt}
            </Paragraph>
            {renderAnswer(q, false)}
          </div>
        ))}
      </Card>

      <div className="flex justify-end mt-4">
        <Button type={phase === 'AFTER' ? 'primary' : 'default'} onClick={advanceDoc}>
          {isLastDoc ? t('exam.coFinish') : t('exam.coNextDoc')}
        </Button>
      </div>
    </div>
  );
}
