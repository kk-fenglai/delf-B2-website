"""
TCF pipeline step 2 — build a DRAFT items file per booklet from the OCR text,
the page geometry (item separator rules → item count per page + which item an
embedded image belongs to), the listening transcript and the answer key.

Input : <work>/tcf<N>/{pages/*.ocr.txt, images.json, answers.json, transcript.txt}
Output: <work>/tcf<N>/draft.json   (to be proofread against the page PNGs →
        items.json, consumed by build_import.js)

Usage:
  python backend/scripts/tcf/parse_items.py <TV5monde folder> <work dir> [N ...]
"""
import glob
import json
import os
import re
import sys

import fitz

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\davin\OneDrive\Desktop\TV5monde"
WORK = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "content", "tcf-sets", "_work")
ONLY = {int(x) for x in sys.argv[3:]} if len(sys.argv) > 3 else None

# OCR renders the "Validé par CIE" stamp as: "Validé par CIE", "ValidéparCIE à",
# "ValidépardE", "Validé PaFCIE TS SSS…" — accept any short line starting with Valid.
def is_valide_stamp(ln):
    t = ln.split()
    return bool(t) and t[0].startswith("Valid") and len(t) <= 5 and "?" not in ln and not ln.rstrip().endswith(".")
# Section instructions (rendered with an arrow icon → ">") are not item text.
INSTR_RE = re.compile(r"^\s*>|^(Écoutez|Lisez).*Choisissez", re.I)
OPT_RE = re.compile(r"^\s*([A-D])(?:[\s_|.:]+|$)(.*)$")
NOISE_RE = re.compile(r"^[\W\d_]*$")  # lines without any letter


def section_of(n):
    return "CO" if n <= 15 else "SL" if n <= 25 else "CE"


def item_rules(page):
    """y of the horizontal rule drawn under each item number (one per item)."""
    ys = []
    for d in page.get_drawings():
        r = d["rect"]
        if r.width > 450 and r.height < 2.5 and 60 < r.y0 < 780:
            ys.append(round(r.y0, 1))
    return sorted(set(ys))


def ocr_blocks(text):
    """Split one page's OCR text into per-item blocks on 'Validé par CIE'."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln.strip()]
    # header / footer
    lines = [ln for ln in lines if "CIEP" not in ln and "localhost" not in ln and not re.match(r"^\d+ sur \d+", ln)]
    blocks, cur, seen = [], None, False
    preamble = []
    for ln in lines:
        if INSTR_RE.search(ln):
            if not seen:
                preamble.append(ln)
            continue
        if is_valide_stamp(ln):
            if cur is not None:
                blocks.append(cur)
            cur = []
            seen = True
            continue
        if not seen:
            preamble.append(ln)
        elif cur is not None:
            cur.append(ln)
    if cur is not None:
        blocks.append(cur)
    return preamble, blocks


def find_options(lines):
    """Index of the first of 4 consecutive lines starting with A, B, C, D."""
    for i in range(len(lines) - 3):
        ok = True
        for k, letter in enumerate("ABCD"):
            m = OPT_RE.match(lines[i + k])
            if not m or m.group(1) != letter:
                ok = False
                break
        if ok:
            return i
    return -1


def clean_line(s):
    s = s.replace("||", "Il").replace("|l", "Il").replace("l|", "Il")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def split_block(lines):
    i = find_options(lines)
    if i < 0:
        return None
    opts = []
    for k, letter in enumerate("ABCD"):
        m = OPT_RE.match(lines[i + k])
        opts.append({"label": letter, "text": clean_line(m.group(2))})
    before = [clean_line(x) for x in lines[:i] if not NOISE_RE.match(x)]
    after = [clean_line(x) for x in lines[i + 4:] if not NOISE_RE.match(x)]
    return before, opts, after


def split_question(before):
    """CE: last sentence(s) ending with '?' = question; the rest = document."""
    if not before:
        return "", ""
    qi = None
    for j in range(len(before) - 1, -1, -1):
        if before[j].endswith("?"):
            qi = j
            break
    if qi is None:
        return " ".join(before), ""
    start = qi
    while start > 0 and not re.search(r"[.!?…)]\s*$", before[start - 1]):
        start -= 1
    return " ".join(before[:start]), " ".join(before[start:qi + 1])


def gap_prompt(before, after):
    """SL: 'Tu veux que je...' + '… les courses ?' → 'Tu veux que je ______ les courses ?'"""
    b = " ".join(before)
    a = " ".join(after)
    b = re.sub(r"[\s.…]+$", "", b)
    a = re.sub(r"^[\s.…]+", "", a)
    return (b + " ______ " + a).strip()


def parse_transcript(text):
    """{n: {'answer': 'B', 'lines': [...], 'texte': str|None, 'question': str|None, 'spoken': [..]}}"""
    items = {}
    marks = list(re.finditer(r"^\((\d+)\)\s*([A-D])\s*$", text, re.M))
    for idx, m in enumerate(marks):
        n = int(m.group(1))
        end = marks[idx + 1].start() if idx + 1 < len(marks) else len(text)
        body = text[m.end():end]
        raw = [ln.strip() for ln in body.splitlines() if ln.strip() and ln.strip() != "-"]
        # join wrapped lines, keep 'Texte :' / 'Q :' / 'A.' markers as boundaries
        joined = []
        for ln in raw:
            if joined and not re.match(r"^(Texte\s*:|Q\s*:|[A-D]\.\s)", ln) and not re.match(r"^(Texte\s*:|Q\s*:)", joined[-1] + " ") :
                if re.match(r"^[A-D]\.\s", joined[-1]):
                    joined[-1] += " " + ln
                    continue
            if joined and not re.match(r"^(Texte\s*:|Q\s*:|[A-D]\.\s)", ln):
                joined[-1] += " " + ln
            else:
                joined.append(ln)
        texte = question = None
        spoken = []
        other = []
        for ln in joined:
            if re.match(r"^Texte\s*:", ln):
                texte = re.sub(r"^Texte\s*:\s*", "", ln)
            elif re.match(r"^Q\s*:", ln):
                question = re.sub(r"^Q\s*:\s*", "", ln)
            elif re.match(r"^[A-D]\.\s", ln):
                spoken.append(ln)
            else:
                other.append(ln)
        items[n] = {"answer": m.group(2), "texte": texte, "question": question,
                    "spoken": spoken, "other": other}
    return items


def build(n):
    dest = os.path.join(WORK, f"tcf{n}")
    pdf = glob.glob(os.path.join(SRC, "TV5monde原题", f"tcf{n}.pdf")) + glob.glob(os.path.join(SRC, "TV5monde原题", f"tcf{n}-*.pdf"))
    doc = fitz.open(pdf[0])
    images = json.load(open(os.path.join(dest, "images.json"), encoding="utf-8"))
    answers = json.load(open(os.path.join(dest, "answers.json"), encoding="utf-8"))
    transcript = parse_transcript(open(os.path.join(dest, "transcript.txt"), encoding="utf-8").read())

    items = []
    warnings = []
    item_no = 0
    instruction = None
    for idx in range(2, len(doc) - 1):
        pno = idx + 1
        page = doc[idx]
        rules = item_rules(page)
        ocr_path = os.path.join(dest, "pages", f"p{pno:02d}.ocr.txt")
        preamble, blocks = ocr_blocks(open(ocr_path, encoding="utf-8").read())
        if preamble and not instruction:
            instruction = " ".join(preamble)
        page_uncertain = False
        if len(rules) == 1 and len(blocks) != 1:
            # single-item page whose stamp OCR failed: everything is the item
            blocks = [preamble + [l for b in blocks for l in b]] if blocks or preamble else [[]]
            preamble = []
        if len(blocks) != len(rules):
            page_uncertain = True
            warnings.append(f"p{pno}: {len(rules)} items on page but {len(blocks)} OCR blocks — items on this page need rebuilding from the image")
        count = len(rules) if rules else len(blocks)
        page_images = [im for im in images if im["page"] == pno]
        for k in range(count):
            item_no += 1
            n_item = item_no
            block = blocks[k] if k < len(blocks) else []
            y0 = rules[k] if k < len(rules) else 0
            y1 = rules[k + 1] if k + 1 < len(rules) else 9999
            img = next((im["file"] for im in page_images if y0 <= im["bbox"][1] < y1), None)
            parsed = split_block(block)
            sec = section_of(n_item)
            item = {"n": n_item, "section": sec, "page": pno, "answer": answers.get(str(n_item)),
                    "image": img, "prompt": "", "passage": None, "options": [], "spokenOptions": None,
                    "transcript": None, "ocr": "\n".join(block), "flags": []}
            if parsed:
                before, opts, after = parsed
                item["options"] = opts
            else:
                before, opts, after = block, [], []
                item["flags"].append("OPTIONS_NOT_FOUND")
            if sec == "CO":
                tr = transcript.get(n_item, {})
                item["transcript"] = tr.get("texte") or (" ".join(tr.get("other", [])) or None)
                if tr.get("question"):
                    item["prompt"] = tr["question"]
                elif not img:
                    item["flags"].append("NO_TRANSCRIPT_QUESTION")
                if tr.get("spoken"):
                    item["spokenOptions"] = tr["spoken"]
                if all(not o["text"] for o in opts) and img:
                    # picture item: options are spoken only
                    item["options"] = [{"label": l, "text": ""} for l in "ABCD"]
                    item["prompt"] = item["prompt"] or "Écoutez les quatre propositions et choisissez celle qui correspond à l’image."
                if tr.get("answer") and tr["answer"] != item["answer"]:
                    item["flags"].append(f"TRANSCRIPT_ANSWER_{tr['answer']}_GRID_{item['answer']}")
            elif sec == "SL":
                item["prompt"] = gap_prompt(before, after)
            else:
                passage, question = split_question(before)
                if after:
                    passage = (passage + " " + " ".join(after)).strip()
                item["passage"] = passage or None
                item["prompt"] = question
                if not question:
                    item["flags"].append("NO_QUESTION")
            if page_uncertain:
                item["flags"].append("OCR_BLOCKS_MISMATCH")
            if not item["answer"]:
                item["flags"].append("NO_ANSWER")
            items.append(item)
    if item_no != 40:
        warnings.append(f"expected 40 items, got {item_no}")
    out = {"test": n, "instruction": instruction, "warnings": warnings, "items": items}
    with open(os.path.join(dest, "draft.json"), "w", encoding="utf-8") as w:
        json.dump(out, w, ensure_ascii=False, indent=1)
    flagged = sum(1 for it in items if it["flags"])
    print(f"tcf{n}: items={item_no} flagged={flagged} warnings={len(warnings)}" + (" :: " + " | ".join(warnings) if warnings else ""))


def main():
    ns = sorted(int(re.search(r"tcf(\d+)", d).group(1)) for d in glob.glob(os.path.join(WORK, "tcf*")) if os.path.isdir(d))
    for n in ns:
        if ONLY and n not in ONLY:
            continue
        build(n)


if __name__ == "__main__":
    main()
