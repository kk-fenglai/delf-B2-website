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

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'mark'; value: string; correction: EssayCorrection };

function splitByCorrections(text: string, corrections: EssayCorrection[]) {
  // Greedy, first-match-wins per correction. We walk corrections in document
  // order (by found offset) and cut the text into segments. If a correction's
  // excerpt doesn't appear at all, it stays in the "unmatched" list.
  const matches: Array<{ start: number; end: number; correction: EssayCorrection }> = [];
  const unmatched: EssayCorrection[] = [];
  const claimed: boolean[] = Array(text.length).fill(false);

  for (const c of corrections) {
    if (!c.excerpt) { unmatched.push(c); continue; }
    const idx = text.indexOf(c.excerpt);
    if (idx < 0) { unmatched.push(c); continue; }
    // Skip if any character in range is already claimed (overlapping matches).
    let clash = false;
    for (let i = idx; i < idx + c.excerpt.length; i++) if (claimed[i]) { clash = true; break; }
    if (clash) { unmatched.push(c); continue; }
    for (let i = idx; i < idx + c.excerpt.length; i++) claimed[i] = true;
    matches.push({ start: idx, end: idx + c.excerpt.length, correction: c });
  }
  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, m.start) });
    segments.push({ kind: 'mark', value: text.slice(m.start, m.end), correction: m.correction });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) });

  return { segments, unmatched };
}

type Props = {
  text: string;
  corrections: EssayCorrection[];
};

export default function EssayInlineAnnotations({ text, corrections }: Props) {
  const { t } = useTranslation();
  const { segments, unmatched } = useMemo(
    () => splitByCorrections(text, corrections),
    [text, corrections]
  );

  return (
    <div>
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
                    {t(`essay.correctionType.${s.correction.type}`)}
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
                }}
              >
                {s.value}
              </mark>
            </Tooltip>
          )
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="mt-4 text-xs">
          <div className="font-semibold mb-1 text-gray-600">
            {t('essay.grade.corrections')}
          </div>
          <ul className="list-disc pl-5 text-gray-600">
            {unmatched.map((c, i) => (
              <li key={i}>
                <Tag color={TYPE_COLOUR[c.type]} style={{ color: '#fff' }}>
                  {t(`essay.correctionType.${c.type}`)}
                </Tag>{' '}
                <em>{c.issue}</em> → {c.suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
