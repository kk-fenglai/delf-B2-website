# TCF booklet proofreading — instructions for the per-test agent

You proofread ONE TV5Monde TCF practice booklet (`tcf<N>`) and produce
`items.json`. Work dir: `backend/content/tcf-sets/_work/tcf<N>/`.

Inputs in that folder:

- `draft.json` — machine draft built from OCR. **OCR is imperfect**: missing
  spaces ("Lescinéastes"), `||`/`|l` for "Il", wrong or missing accents,
  dropped words, stray symbols, wrongly split passage/question, and on pages
  flagged `OCR_BLOCKS_MISMATCH` the items may be shifted or merged.
- `pages/pNN.png` — the rendered booklet pages. **This is the source of truth
  for all printed text.** Every item carries its `page`.
- `images/` — embedded photos / document images (`draft.items[].image`).
- `transcript.txt` — listening transcript (third-party). Source for the
  spoken question / spoken text of CO items; you cannot verify audio, so keep
  transcript-derived text as-is apart from obvious typos.
- `answers.json` — official answer grid. **Never change an answer.**

## Booklet structure (identical for all 17)

| items | section | what is printed |
|---|---|---|
| 1–15 | CO listening | 1–4 (sometimes 1–3): a photo + bare letters A B C D — options are spoken only. Some early items have no photo and no printed options (question + options all spoken). 5–15: four printed options only; the question is spoken (`transcript` "Q :"). |
| 16–25 | SL grammar | a sentence with a gap: text before the options and/or text after them (`… les courses avant de rentrer ?`). |
| 26–40 | CE reading | a short document (usually an image of text: article, ad, notice, poster), then the question, then 4 options. |

## What to do, item by item (all 40)

1. Open the item's page image. Compare `prompt`, `passage`, `options[].text`
   character by character with what is printed. Fix OCR errors. Keep French
   typography as printed (space before `? : ; !`, guillemets, apostrophes,
   accents, capitals). Keep the option order A–D as printed.
2. **CO 1–15**
   - Picture / audio-only items (bare A B C D printed): `options` = four
     entries with empty `text` (`""`); keep `image` if the item has a photo;
     `prompt` = the spoken question from the transcript if there is one,
     otherwise the instruction printed at the top of the section (e.g.
     "Écoutez les 4 propositions. Choisissez celle qui correspond à l’image.").
     Keep `spokenOptions` from the transcript.
   - Items with printed options: verify the 4 options against the image.
     `prompt` = spoken question (transcript), `transcript` = spoken text.
   - If the draft has no `transcript`/`prompt` for an item, look in
     `transcript.txt` under `(n)` and fill them in.
3. **SL 16–25**: `prompt` is the full sentence with the gap written as
   `______` (six underscores), e.g. `Tu veux que je ______ les courses avant de
   rentrer ?`. Rebuild it from the page if the draft split it wrongly.
   `passage` stays `null`.
4. **CE 26–40**: `passage` = the complete text of the document as printed, in
   reading order; separate paragraphs with `\n\n`; drop decorative noise. If
   the OCR of the document is garbled, transcribe it from `pages/pNN.png`
   (zoom by reading `images/<file>` too — it is the document at full
   resolution). `prompt` = the question line. If the document's meaning
   depends on non-text content (map, chart, table layout, a photo that the
   question refers to), add `"needsImage": true` so the picture is shown
   alongside the text.
5. Every item must end with exactly 4 options labelled A, B, C, D and a
   non-empty `prompt`. `answer` is copied from the draft unchanged.
6. If something is unreadable or you are unsure, keep your best reading and
   put a short note in the item's `notes`; list unresolved problems in the
   top-level `issues` array. Never invent text that is not on the page.

## Output — write `items.json` in the same folder

```json
{
  "test": 1,
  "items": [
    {
      "n": 1, "section": "CO", "page": 3, "answer": "B",
      "prompt": "Écoutez les 4 propositions. Choisissez celle qui correspond à l’image.",
      "passage": null,
      "options": [{"label":"A","text":""},{"label":"B","text":""},{"label":"C","text":""},{"label":"D","text":""}],
      "image": "p03_0.png",
      "spokenOptions": ["A. On fait une équipe de 5 ?", "B. On joue ensemble ?", "C. On regarde le match ?", "D. On se lance le ballon ?"],
      "transcript": null,
      "needsImage": false,
      "notes": ""
    }
  ],
  "issues": []
}
```

Keep the draft's field names; drop `ocr` and `flags`. Do not modify any other
file in the repository. Finish with a 3-line summary: items fixed, items with
notes, unresolved issues.
