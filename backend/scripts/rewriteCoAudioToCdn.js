// Rewrite co-sets listening audioUrl from the local mount (/api/audio/fei/<file>)
// to an absolute CDN URL (<base>/<prefix><file>). The backend's signAudioUrl
// passes absolute http(s) URLs through unchanged, so the runner streams straight
// from the CDN. Also syncs the listening-sets/<slug>/questions.json bundle copies.
//
// Usage:
//   cd backend
//   node scripts/rewriteCoAudioToCdn.js https://cdn.example.com            # prefix defaults to "co/"
//   node scripts/rewriteCoAudioToCdn.js https://cdn.example.com co/ --dry-run
//
// Re-runnable: matches the /api/audio/fei/ mount only, so running twice is a no-op.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));
const base = (positional[0] || '').replace(/\/+$/, '');
const prefix = positional[1] != null ? positional[1] : 'co/';

if (!/^https?:\/\//.test(base)) {
  console.error('错误: 第一个参数必须是 CDN 基地址, 例如 https://cdn.example.com');
  process.exit(1);
}

const CONTENT = path.join(__dirname, '..', 'content');
const BUNDLE_DIR = path.join(CONTENT, 'listening-sets');
const MOUNT = '/api/audio/fei/';
// Both the standalone listening sets and the mock exams (whose CO section was
// filled from those listening sets) carry /api/audio/fei/ URLs.
const DIRS = [path.join(CONTENT, 'co-sets'), path.join(CONTENT, 'mock-sets')];

let changed = 0;
const report = [];

for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_') || !f.endsWith('.import.json')) continue;
    const p = path.join(dir, f);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    let touched = 0;

    for (const q of data.questions || []) {
      if (typeof q.audioUrl === 'string' && q.audioUrl.startsWith(MOUNT)) {
        const file = q.audioUrl.slice(MOUNT.length);
        q.audioUrl = `${base}/${prefix}${file}`;
        touched += 1;
      }
    }

    if (touched) {
      changed += 1;
      const sampleUrl = (data.questions.find((q) => q.audioUrl)).audioUrl;
      report.push(`${path.basename(dir)}/${f}: ${touched} 题 -> ${sampleUrl}`);
      if (!dryRun) {
        fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        // sync listening-sets bundle copy if present (co-sets only)
        const slug = f.replace('.import.json', '');
        const bundle = path.join(BUNDLE_DIR, slug, 'questions.json');
        if (fs.existsSync(bundle)) {
          fs.writeFileSync(bundle, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        }
      }
    }
  }
}

console.log(report.join('\n') || '没有需要改写的文件 (可能已经是 CDN 链接)。');
console.log(`\n${dryRun ? '[dry-run] 将改写' : '已改写'} ${changed} 个套题文件。`);
