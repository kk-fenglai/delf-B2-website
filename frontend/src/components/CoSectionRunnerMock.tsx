// Strict timeline-driven runner for the DELF B2 Compréhension de l'Oral
// section. Used by full mock-exam mode (isMock=true) where the real DELF
// rules must be enforced exactly.
//
// Rules implemented here:
//   - Each AudioDocument has its own play count (Ex.1 = 2 plays, Ex.2 = 1).
//   - A fixed reading-the-questions window before the first play
//     (`prepSeconds`, typically 60s).
//   - For 2-play documents, a `gapSeconds` window (typically 180s = 3 min)
//     sits between the two plays. Answer editing IS allowed during the gap.
//   - After the last play, an optional `answerSeconds` window finalizes
//     answers for THIS document; once it expires we advance to the next
//     document automatically. The questions of past documents become
//     read-only — DELF doesn't let you go back.
//   - Audio plays automatically at the PLAY phase. No user Play/Pause
//     button: candidates can't trigger a replay or pause real audio.
//
// State machine (one runtime per document, run sequentially):
//
//     PREP ──(prepSeconds)──► PLAY (#1) ──(audio end)──► GAP ──(gapSeconds)──► PLAY (#2)
//                                                              if maxPlays==1, skip GAP+#2
//     PLAY (last) ──(audio end)──► ANSWER ──(answerSeconds)──► DONE → next doc
//
// When all documents reach DONE, onComplete() is called so the parent runner
// can submit / advance to the next section.
//
// For the relaxed practice version (free play/pause/replay, no timed phases)
// see CoSectionRunner.tsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Progress, Steps, Tag, Typography } from 'antd';
import { ClockCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AudioDocument, Question } from '../types';

const { Title, Paragraph } = Typography;

type Phase = 'PREP' | 'PLAY' | 'GAP' | 'ANSWER' | 'DONE';

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
          id: '__orphan__',
          order: ordered.length,
          title: null,
          audioUrl: null,
          maxPlays: 1,
          prepSeconds: 30,
          gapSeconds: 0,
          answerSeconds: 60,
        },
        qs: orphans,
      });
    }
    return ordered;
  }, [documents, questions]);

  const [docIdx, setDocIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('PREP');
  const [playsDone, setPlaysDone] = useState(0); // for the current document
  const [remaining, setRemaining] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const current = groups[docIdx];

  // Configure the countdown when phase / docIdx changes.
  useEffect(() => {
    if (!current) {
      if (groups.length > 0) onComplete();
      return;
    }
    if (phase === 'PREP') setRemaining(current.doc.prepSeconds);
    else if (phase === 'GAP') setRemaining(current.doc.gapSeconds);
    else if (phase === 'ANSWER') setRemaining(current.doc.answerSeconds);
    else setRemaining(0);
    // PLAY duration is driven by the audio's own end event, not a timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, docIdx]);

  // Timer driver — runs once per second whenever a fixed-duration phase is
  // active. Decrements `remaining`; at zero we advance phase.
  useEffect(() => {
    if (phase === 'PLAY' || phase === 'DONE') return;
    if (remaining <= 0) {
      advancePhase();
      return;
    }
    const t = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining]);

  // When entering PLAY, kick off the audio. When leaving PLAY, hard-stop it.
  useEffect(() => {
    if (!current) return;
    const el = audioRef.current;
    if (phase === 'PLAY') {
      if (!current.doc.audioUrl || !el) {
        // No audio uploaded → treat PLAY as an instant no-op and advance.
        finishCurrentPlay();
        return;
      }
      try {
        el.currentTime = 0;
        el.play().catch(() => { /* user-gesture issues are non-fatal */ });
      } catch { /* ignore */ }
    } else if (el) {
      try { el.pause(); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, docIdx]);

  // Hard-stop on unmount.
  useEffect(() => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
  }, []);

  function finishCurrentPlay() {
    const c = groups[docIdx];
    if (!c) return;
    const nextPlays = playsDone + 1;
    setPlaysDone(nextPlays);
    if (nextPlays < c.doc.maxPlays) {
      // Still more plays to go → enter the gap (or skip if gap=0).
      if (c.doc.gapSeconds > 0) setPhase('GAP');
      else setPhase('PLAY');
    } else if (c.doc.answerSeconds > 0) {
      setPhase('ANSWER');
    } else {
      goToNextDoc();
    }
  }

  function goToNextDoc() {
    const next = docIdx + 1;
    if (next >= groups.length) {
      setPhase('DONE');
      onComplete();
    } else {
      setDocIdx(next);
      setPlaysDone(0);
      setPhase(groups[next].doc.prepSeconds > 0 ? 'PREP' : 'PLAY');
    }
  }

  function advancePhase() {
    if (phase === 'PREP') setPhase('PLAY');
    else if (phase === 'GAP') setPhase('PLAY');
    else if (phase === 'ANSWER') goToNextDoc();
  }

  if (!current) {
    return <Alert type="info" message={t('exam.coPhaseDone')} showIcon />;
  }

  const phaseColor: Record<Phase, string> = {
    PREP: 'blue', PLAY: 'orange', GAP: 'gold', ANSWER: 'green', DONE: 'default',
  };
  const phaseLabel: Record<Phase, string> = {
    PREP: t('exam.coPhasePrep'),
    PLAY: t('exam.coPhasePlay'),
    GAP: t('exam.coPhaseGap'),
    ANSWER: t('exam.coPhaseAnswer'),
    DONE: t('exam.coPhaseDone'),
  };

  // Answer editing rules per DELF: locked during PLAY (you're listening,
  // not writing). Past documents are locked entirely.
  const isCurrentEditable = phase === 'GAP' || phase === 'ANSWER' || phase === 'PREP';

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

      <Alert
        type="info"
        showIcon
        icon={phase === 'PLAY' ? <SoundOutlined /> : <ClockCircleOutlined />}
        className="mb-3"
        message={
          <span>
            <Tag color={phaseColor[phase]}>{phaseLabel[phase]}</Tag>
            {phase !== 'PLAY' && phase !== 'DONE' && (
              <span className="ml-2">{t('exam.coCountdown', { sec: remaining })}</span>
            )}
            {phase === 'PLAY' && (
              <span className="ml-2 tabular-nums text-muted">
                {playsDone + 1} / {current.doc.maxPlays}
              </span>
            )}
          </span>
        }
        description={
          phase !== 'PLAY' && phase !== 'DONE' ? (
            <Progress
              percent={
                phase === 'PREP'
                  ? Math.round((1 - remaining / Math.max(1, current.doc.prepSeconds)) * 100)
                  : phase === 'GAP'
                    ? Math.round((1 - remaining / Math.max(1, current.doc.gapSeconds)) * 100)
                    : Math.round((1 - remaining / Math.max(1, current.doc.answerSeconds)) * 100)
              }
              size="small"
              showInfo={false}
            />
          ) : null
        }
      />

      <audio
        ref={audioRef}
        src={current.doc.audioUrl || undefined}
        preload="auto"
        onEnded={finishCurrentPlay}
      />

      {!current.doc.audioUrl && (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message={t('exam.audioNotUploaded')}
        />
      )}

      <Card bordered={false} className="app-surface">
        {current.qs.map((q, qi) => (
          <div key={q.id} className={qi > 0 ? 'mt-5 pt-5 border-t' : ''}>
            <Paragraph className="text-base font-semibold mb-3">
              {qi + 1}. {q.prompt}
            </Paragraph>
            {renderAnswer(q, !isCurrentEditable)}
            {!isCurrentEditable && (
              <div className="text-xs text-muted mt-2">
                {t('exam.coCannotEditYet')}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
