/* eslint-disable no-console */
// TCF pipeline step 4 — upload the booklet audio (one MP3 per test) and the
// pictures referenced by items.json to Cloudflare R2, under the keys that
// buildImport.js writes into the import JSON:
//   tcf/audio/tcf<N>.mp3
//   tcf/img/tcf<N>-<file>.png
//
// Idempotent: a HEAD on the public URL skips objects that already exist.
// Env: R2_* (see scripts/lib/r2.js). Usage:
//   cd backend
//   node scripts/tcf/uploadAssets.js "C:\...\TV5monde" [N ...] [--dry-run]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { putObject, r2Config } = require('../lib/r2');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SRC = args.find((a) => !a.startsWith('--') && Number.isNaN(Number(a))) || 'C:\\Users\\davin\\OneDrive\\Desktop\\TV5monde';
const only = args.map(Number).filter(Boolean);
const WORK = path.join(__dirname, '..', '..', 'content', 'tcf-sets', '_work');

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function upload(key, file, type, publicBase) {
  const url = `${publicBase}/${key}`;
  if (await exists(url)) {
    console.log(`  skip (exists) ${key}`);
    return url;
  }
  if (DRY) {
    console.log(`  would upload ${key} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
    return url;
  }
  const out = await putObject(key, fs.readFileSync(file), type);
  console.log(`  uploaded ${key}`);
  return out;
}

async function main() {
  const { publicBase } = r2Config();
  const dirs = fs.readdirSync(WORK).filter((d) => /^tcf\d+$/.test(d) && fs.existsSync(path.join(WORK, d, 'items.json')));
  const ns = dirs.map((d) => Number(d.slice(3))).filter((n) => !only.length || only.includes(n)).sort((a, b) => a - b);
  for (const n of ns) {
    console.log(`tcf${n}`);
    const mp3 = path.join(SRC, 'TV5monde音频', `tcf${n}-podcast.mp3`);
    if (!fs.existsSync(mp3)) throw new Error(`missing audio ${mp3}`);
    await upload(`tcf/audio/tcf${n}.mp3`, mp3, 'audio/mpeg', publicBase);
    const items = JSON.parse(fs.readFileSync(path.join(WORK, `tcf${n}`, 'items.json'), 'utf8')).items;
    for (const it of items) {
      if (!it.image) continue;
      const file = path.join(WORK, `tcf${n}`, 'images', it.image);
      if (!fs.existsSync(file)) throw new Error(`missing image ${file}`);
      await upload(`tcf/img/tcf${n}-${it.image}`, file, 'image/png', publicBase);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
