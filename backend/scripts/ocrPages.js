// One-off: OCR rendered page PNGs with Tesseract (French) to get a text draft.
// Usage: node scripts/ocrPages.js <dirWithPngs> [lang]
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

async function main() {
  const dir = process.argv[2];
  const lang = process.argv[3] || 'fra';
  if (!dir) { console.error('Usage: node scripts/ocrPages.js <dir> [lang]'); process.exit(1); }
  const pngs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  // New tesseract.js loads the language at createWorker() time; loadLanguage/
  // initialize are deprecated no-ops, so the lang MUST be passed here.
  const worker = await createWorker(lang);
  try {
    for (const f of pngs) {
      const buf = fs.readFileSync(path.join(dir, f));
      // eslint-disable-next-line no-await-in-loop
      const r = await worker.recognize(buf);
      const out = path.join(dir, f.replace(/\.png$/i, '.ocr.txt'));
      fs.writeFileSync(out, r?.data?.text || '');
      console.log(`OCR ${f} -> ${path.basename(out)} (${(r?.data?.text || '').length} chars)`);
    }
  } finally {
    await worker.terminate();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
