import type { ReactNode } from 'react';

// Minimal inline-image support for question prompts / passages: the token
// `![alt](https://…)` renders as an <img>; everything else stays plain text
// (no HTML, no other markdown). Used by TCF picture items (listening 1–4),
// whose stimulus is a photo with spoken-only options.
const IMG_RE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(IMG_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <img
        key={`img-${start}`}
        src={m[2]}
        alt={m[1]}
        loading="lazy"
        className="block max-w-full rounded-lg my-2"
        style={{ maxHeight: 360 }}
      />,
    );
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Passage text: single newlines (PDF line-wrap artifacts) become spaces;
// double newlines become paragraph breaks.
export function renderPassage(text: string): ReactNode[] {
  return text
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((para, i) => <p key={i}>{renderInline(para)}</p>);
}
