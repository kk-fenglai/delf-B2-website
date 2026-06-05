// One-off helper: render PDF pages to PNG so they can be read visually.
// Usage: node scripts/renderPdfPages.js <pdfPath> <outDir> [scale] [pages]
//   pages: comma list (e.g. "1,2,3") -> rendered via `partial`
const fs = require('fs');
const path = require('path');
const { PDFParse, VerbosityLevel } = require('pdf-parse');

async function main() {
  const pdfPath = process.argv[2];
  const outDir = process.argv[3];
  const scale = process.argv[4] ? Number(process.argv[4]) : 2;
  const pagesArg = process.argv[5];
  if (!pdfPath || !outDir) {
    console.error('Usage: node scripts/renderPdfPages.js <pdfPath> <outDir> [scale] [pages]');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf, verbosity: VerbosityLevel.ERRORS });
  const params = { scale, pageDataUrl: false };
  let partial = null;
  if (pagesArg) {
    partial = pagesArg.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
    params.partial = partial;
  }
  try {
    const shots = await parser.getScreenshot(params);
    const pages = shots.pages || [];
    console.log(`rendered ${pages.length} page(s) at scale ${scale}`);
    pages.forEach((p, i) => {
      const png = Buffer.from(p.data || []);
      const num = partial ? partial[i] : i + 1;
      const f = path.join(outDir, `page-${String(num).padStart(2, '0')}.png`);
      fs.writeFileSync(f, png);
      console.log(`wrote ${f} (${png.length} bytes)`);
    });
  } finally {
    await parser.destroy();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
