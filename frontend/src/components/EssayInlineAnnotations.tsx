import { useMemo } from 'react';
import { Tooltip, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { EssayCorrection, CorrectionType } from '../types';

// Inline highlighter. Given the raw essay text and a list of corrections with
// `excerpt` fields, render the text with each first-match excerpt wrapped in
// a coloured <mark> that shows a hover tooltip. Corrections that fail to match
// are surfaced as a plain list below the body so nothing is silently dropped.

const TYPE_COLOUR: Record<CorrectionType, string> = {
  grammar: '#ff4d4f',     // red
  lexique: '#1677ff',     // blue
  orthographe: '#faad14', // yellow
  syntaxe: '#722ed1',     // purple
};

const TYPE_BG: Record<CorrectionType, string> = {
  grammar: 'rgba(255,77,79,0.14)',
  lexique: 'rgba(22,119,255,0.14)',
  orthographe: 'rgba(250,173,20,0.18)',
  syntaxe: 'rgba(114,46,209,0.14)',
};

const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧'];

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'mark'; value: string; correction: EssayCorrection; index: number };

function splitByCorrections(text: string, corrections: EssayCorrection[]) {
  const matches: Array<{ start: number; end: number; correction: EssayCorrection; origIndex: number }> = [];
  const unmatchedIndices: number[] = [];
  const claimed: boolean[] = Array(text.length).fill(false);

  corrections.forEach((c, origIndex) => {
    if (!c.excerpt) { unmatchedIndices.push(origIndex); return; }
    const idx = text.indexOf(c.excerpt);
    if (idx < 0) { unmatchedIndices.push(origIndex); return; }
    let clash = false;
    for (let i = idx; i < idx + c.excerpt.length; i++) if (claimed[i]) { clash = true; break; }
    if (clash) { unmatchedIndices.push(origIndex); return; }
    for (let i = idx; i < idx + c.excerpt.length; i++) claimed[i] = true;
    matches.push({ start: idx, end: idx + c.excerpt.length, correction: c, origIndex });
  });
  matches.sort((a, b) => a.start - b.start);

  // Assign display numbers in document order for matched, then unmatched.
  const indexMap = new Map<number, number>();
  matches.forEach((m, i) => indexMap.set(m.origIndex, i));
  unmatchedIndices.forEach((origIdx, i) => indexMap.set(origIdx, matches.length + i));

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, m.start) });
    segments.push({ kind: 'mark', value: text.slice(m.start, m.end), correction: m.correction, index: indexMap.get(m.origIndex)! });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) });

  return { segments, indexMap, unmatchedIndices };
}

type Props = {
  text: string;
  corrections: EssayCorrection[];
};

export default function EssayInlineAnnotations({ text, corrections }: Props) {
  const { t } = useTranslation();
  const { segments, indexMap, unmatchedIndices } = useMemo(
    () => splitByCorrections(text, corrections),
    [text, corrections]
  );

  return (
    <div>
      {/* Original text with highlighted excerpts */}
      <div className="whitespace-pre-wrap leading-relaxed text-sm">
        {segments.map((s, i) =>
          s.kind === 'text' ? (
            <span key={i}>{s.value}</span>
          ) : (
            <Tooltip
              key={i}
              title={
                <div className="text-xs">
                  <div className="font-semibold mb-1">
                    {CIRCLED[s.index] ?? `(${s.index + 1})`} {t(`essay.correctionType.${s.correction.type}`)}
                  </div>
                  <div className="mb-1"><em>{s.correction.issue}</em></div>
                  <div>→ {s.correction.suggestion}</div>
                </div>
              }
            >
              <mark
                style={{
                  backgroundColor: TYPE_BG[s.correction.type],
                  borderBottom: `2px solid ${TYPE_COLOUR[s.correction.type]}`,
                  padding: '0 2px',
                  borderRadius: 2,
                  cursor: 'help',
                  position: 'relative',
                }}
              >
                {s.value}
                <sup style={{ fontSize: 9, color: TYPE_COLOUR[s.correction.type], marginLeft: 1 }}>
                  {CIRCLED[s.index] ?? s.index + 1}
                </sup>
              </mark>
            </Tooltip>
          )
        )}
      </div>

      {/* Unified correction list for all corrections */}
      {corrections.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <ol className="list-none pl-0 space-y-2">
            {corrections.map((c, origIdx) => {
              const displayIdx = indexMap.get(origIdx) ?? origIdx;
              const isUnmatched = unmatchedIndices.includes(origIdx);
              return (
                <li key={origIdx} className="flex gap-2 text-xs text-gray-700">
                  <span style={{ color: TYPE_COLOUR[c.type], fontWeight: 600, minWidth: 16 }}>
                    {CIRCLED[displayIdx] ?? `(${displayIdx + 1})`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Tag color={TYPE_COLOUR[c.type]} style={{ color: '#fff', fontSize: 10 }}>
                      {t(`essay.correctionType.${c.type}`)}
                    </Tag>
                    {isUnmatched && c.excerpt && (
                      <span className="italic text-gray-500 mr-1">「{c.excerpt}」</span>
                    )}
                    <em className="text-gray-600">{c.issue}</em>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="text-gray-800">{c.suggestion}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
