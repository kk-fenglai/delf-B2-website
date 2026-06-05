// Sequential runner for the Compréhension de l'Oral section.
//
// Playback rules (relaxed from real DELF):
//   - Each AudioDocument plays with native <audio controls> — candidates can
//     pause, resume, replay, seek and change speed freely. No play counter.
//   - No timed phases (no prep / gap / answer countdown). Answers for the
//     current document can be edited at any time.
//   - Documents are still shown one at a time in order; once advanced, past
//     documents become read-only (keeps the "no backtrack" feel and avoids
//     accidental edits after moving on).
//
// Two documents are expected (one short + one long), but the component is
// generic over the document list. The parent's `onComplete` fires after the
// last document so it can submit or advance to the next section.
//
// State machine: just `docIdx`, advanced by a "next document" button.

import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Steps, Tag, Typography } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AudioDocument, Question } from '../types';

const { Title, Paragraph } = Typography;

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

export default function CoSectionRunner({
  documents,
  questions,
  renderAnswer,
  onComplete,
  headerExtra,
}: Props) {
  const { t } = useTranslation();

  // Stable list of (doc, its questions) tuples. Questions without a doc
  // (legacy CO rows before backfill) get bucketed under a synthetic "no
  // document" entry so they still get rendered.
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
          maxPlays: 0,
          prepSeconds: 0,
          gapSeconds: 0,
          answerSeconds: 0,
        },
        qs: orphans,
      });
    }
    return ordered;
  }, [documents, questions]);

  const [docIdx, setDocIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const current = groups[docIdx];

  if (!current) {
    return <Alert type="info" message={t('exam.coPhaseDone')} showIcon />;
  }

  const isLast = docIdx >= groups.length - 1;

  const advance = () => {
    // Stop audio before moving on so the next doc starts from a clean state.
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    if (isLast) {
      onComplete();
    } else {
      setDocIdx(docIdx + 1);
    }
  };

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
          status: i < docIdx ? 'finish' : i === docIdx ? 'process' : 'wait',
        }))}
      />

      {current.doc.audioUrl ? (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg mb-4 border border-blue-100">
          <Tag color="blue" icon={<SoundOutlined />} className="mb-2">🎧 Audio</Tag>
          <audio
            // `key` forces the element to remount when the doc changes so
            // the browser fully resets its state (avoids the previous clip
            // still being buffered/seekable).
            key={current.doc.id}
            ref={audioRef}
            src={current.doc.audioUrl}
            controls
            preload="auto"
            style={{ width: '100%' }}
          />
        </div>
      ) : (
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
            {renderAnswer(q, false)}
          </div>
        ))}
      </Card>

      <div className="flex justify-end mt-4">
        <Button type="primary" onClick={advance}>
          {isLast ? t('exam.coFinish') : t('exam.coNextDoc')}
        </Button>
      </div>
    </div>
  );
}
