"""
TCF (TV5Monde "Livret d'entraînement") booklet extractor — step 1 of the TCF
content pipeline (see README.md in this folder).

For every `tcf<N>*.pdf` booklet it writes to <out>/tcf<N>/ :
  pages/p<PP>.png     item pages rendered at 150 dpi (for OCR + visual proofreading)
  images/p<PP>_<k>.png embedded photos / document images (bbox in images.json)
  images.json         [{file, page, bbox:[x0,y0,x1,y1] (pt), width, height}]
  answers.json        {"1":"B", ..., "40":"C"} read from the Corrigé grid,
                      cross-checked against the transcript's answers for 1–15
  transcript.txt      listening transcript (third-party watermark lines removed)

Usage:
  python backend/scripts/tcf/extract_booklets.py <TV5monde folder> <out dir>

Booklet layout (identical for all 17 sets): p1 intro, p2 answer sheet,
p3..N-1 items (CO 1–15, SL 16–25, CE 26–40), pN Corrigé grid.
"""
import glob
import json
import os
import re
import sys

import fitz  # PyMuPDF

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\davin\OneDrive\Desktop\TV5monde"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "content", "tcf-sets", "_work")

# Corrigé grid template (PDF points, measured on tcf1 where the X marks are
# real text): three blocks of rows (1–15, 16–25, 26–40); each block has four
# option columns spaced ~15.6 pt apart; rows are ~17.4 pt apart.
BLOCKS = [
    {"first": 1, "last": 15, "cols": {"A": 160, "B": 175.5, "C": 191, "D": 207}},
    {"first": 16, "last": 25, "cols": {"A": 294, "B": 309.5, "C": 325, "D": 341}},
    {"first": 26, "last": 40, "cols": {"A": 427, "B": 442.5, "C": 458, "D": 474}},
]
ROW0_Y = 60.0   # centre y of row 1
ROW_DY = 17.4
WATERMARK = re.compile(r"法语备考关注|小红书|微信|mono_fr", re.I)


def template_cells():
    """Yield (item, letter, cx, cy) for all 160 grid cells."""
    for b in BLOCKS:
        for item in range(b["first"], b["last"] + 1):
            cy = ROW0_Y + (item - b["first"]) * ROW_DY
            for letter, cx in b["cols"].items():
                yield item, letter, cx, cy


def marks_from_text(page):
    """Booklets whose Corrigé X marks are real text (tcf1, tcf13)."""
    pts = []
    for w in page.get_text("words"):
        if w[4] == "X":
            pts.append(((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))
    return pts


def marks_from_drawings(page):
    """Booklets whose Corrigé cells are vector rects: the answer is the
    ~14 pt square filled dark grey (0.2,0.2,0.2); empty cells are white."""
    pts = []
    for d in page.get_drawings():
        fill = d.get("fill")
        r = d["rect"]
        if fill and max(fill) < 0.35 and min(fill) > 0.05 and 11 <= r.width <= 17 and 11 <= r.height <= 17:
            pts.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
    return pts


def read_answers(page):
    marks = marks_from_text(page)
    if len(marks) != 40:
        marks = marks_from_drawings(page)
    if len(marks) != 40:
        raise RuntimeError(f"expected 40 answer marks, found {len(marks)}")
    cells = list(template_cells())
    # Global shift: median offset between marks and their nearest template cell.
    offs = []
    for mx, my in marks:
        _, _, cx, cy = min(cells, key=lambda c: (c[2] - mx) ** 2 + (c[3] - my) ** 2)
        offs.append((mx - cx, my - cy))
    offs.sort()
    dx = offs[len(offs) // 2][0]
    dy = sorted(o[1] for o in offs)[len(offs) // 2]
    answers = {}
    worst = 0.0
    for mx, my in marks:
        item, letter, cx, cy = min(cells, key=lambda c: (c[2] + dx - mx) ** 2 + (c[3] + dy - my) ** 2)
        dist = ((cx + dx - mx) ** 2 + (cy + dy - my) ** 2) ** 0.5
        worst = max(worst, dist)
        if str(item) in answers:
            raise RuntimeError(f"item {item} matched twice ({answers[str(item)]} and {letter})")
        answers[str(item)] = letter
    if worst > 6:
        raise RuntimeError(f"answer mark too far from template cell: {worst:.1f} pt")
    return answers


def transcript_answers(text):
    return {m.group(1): m.group(2) for m in re.finditer(r"^\((\d+)\)\s*([A-D])\s*$", text, re.M)}


def clean_transcript(text):
    lines = [ln.rstrip() for ln in text.splitlines()]
    lines = [ln for ln in lines if not WATERMARK.search(ln)]
    out = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


def main():
    booklets = sorted(glob.glob(os.path.join(SRC, "TV5monde原题", "tcf*.pdf")),
                      key=lambda p: int(re.search(r"tcf(\d+)", os.path.basename(p)).group(1)))
    transcripts = {}
    for f in glob.glob(os.path.join(SRC, "TV5Monde文本", "*.pdf")):
        m = re.search(r"Test\s*(\d+)", os.path.basename(f))
        if m:
            transcripts[int(m.group(1))] = f
    problems = []
    for pdf in booklets:
        n = int(re.search(r"tcf(\d+)", os.path.basename(pdf)).group(1))
        dest = os.path.join(OUT, f"tcf{n}")
        os.makedirs(os.path.join(dest, "pages"), exist_ok=True)
        os.makedirs(os.path.join(dest, "images"), exist_ok=True)
        doc = fitz.open(pdf)

        # Transcript first: its (n) X lines are the cross-check for the grid.
        tdoc = fitz.open(transcripts[n])
        ttext = "\n".join(p.get_text() for p in tdoc)
        with open(os.path.join(dest, "transcript.txt"), "w", encoding="utf-8") as w:
            w.write(clean_transcript(ttext))
        t_ans = transcript_answers(ttext)

        try:
            answers = read_answers(doc[-1])
        except RuntimeError as e:
            problems.append(f"tcf{n}: {e}")
            answers = {}
        mismatch = [k for k in map(str, range(1, 16)) if answers.get(k) != t_ans.get(k)]
        if mismatch:
            problems.append(f"tcf{n}: grid vs transcript mismatch on items {mismatch} "
                            f"(grid={[answers.get(k) for k in mismatch]}, transcript={[t_ans.get(k) for k in mismatch]})")
        with open(os.path.join(dest, "answers.json"), "w", encoding="utf-8") as w:
            json.dump(answers, w, indent=1)

        images = []
        for idx in range(2, len(doc) - 1):
            page = doc[idx]
            pno = idx + 1
            page.get_pixmap(dpi=150).save(os.path.join(dest, "pages", f"p{pno:02d}.png"))
            for k, info in enumerate(page.get_image_info(xrefs=True)):
                xref = info.get("xref")
                if not xref:
                    continue
                fname = f"p{pno:02d}_{k}.png"
                pix = fitz.Pixmap(doc, xref)
                if pix.n - pix.alpha >= 4:  # CMYK → RGB
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                pix.save(os.path.join(dest, "images", fname))
                images.append({"file": fname, "page": pno,
                               "bbox": [round(v) for v in info["bbox"]],
                               "width": pix.width, "height": pix.height})
        with open(os.path.join(dest, "images.json"), "w", encoding="utf-8") as w:
            json.dump(images, w, indent=1)
        print(f"tcf{n}: pages={len(doc)} items p3-p{len(doc)-1} images={len(images)} "
              f"answers={len(answers)} transcriptAnswers={len(t_ans)} {'OK' if not mismatch and answers else 'CHECK'}")
    if problems:
        print("\nPROBLEMS:")
        print("\n".join(problems))
        sys.exit(1)


if __name__ == "__main__":
    main()
