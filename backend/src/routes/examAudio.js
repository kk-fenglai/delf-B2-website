// Token-gated streaming of listening-question MP3s.
//
// Replaces the old `express.static('/api/audio/fei', ...)` mount which leaked
// every uploaded mp3 to anyone with the URL. Now: exam routes mint a signed
// short-lived token tied to the filename, and this handler verifies that
// token before streaming. Supports HTTP Range so <audio> can seek/buffer
// (mirrors the recordings.js pattern).

const express = require('express');
const fs = require('fs');
const path = require('path');

const { verify, FEI_PREFIX } = require('../utils/audioToken');

// Tiny mime lookup limited to the formats our admin upload accepts. Keeps us
// from pulling in mime-types just for this one handler.
const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};
function mimeForFilename(name) {
  const ext = path.extname(name || '').toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

const router = express.Router();

const AUDIO_DIR = path.resolve(path.join(__dirname, '..', '..', 'content', 'fei-samples'));

// Defense in depth: reject anything that isn't a plain filename. The Express
// route already disallows '/', but we double-check after path.resolve so that
// a Windows-style "..\\..\\.env" can't escape AUDIO_DIR.
function isSafeFilename(name) {
  return typeof name === 'string'
    && name.length > 0
    && name.length < 256
    && !name.includes('/')
    && !name.includes('\\')
    && !name.includes('..');
}

router.get('/:filename', (req, res) => {
  const { filename } = req.params;
  if (!isSafeFilename(filename)) {
    return res.status(400).json({ error: 'Bad filename' });
  }

  const token = req.query.t;
  const result = verify(filename, token);
  if (!result.ok) {
    return res.status(401).json({ error: 'Invalid or expired audio token', reason: result.reason });
  }

  const abs = path.resolve(path.join(AUDIO_DIR, filename));
  if (!abs.startsWith(AUDIO_DIR + path.sep) && abs !== AUDIO_DIR) {
    return res.status(400).json({ error: 'Bad path' });
  }
  if (!fs.existsSync(abs)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const stat = fs.statSync(abs);
  const contentType = mimeForFilename(filename);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  // private — never let an intermediary cache this; the token is per-user-ish.
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return res.status(416).end();
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (start >= stat.size || end >= stat.size || start > end) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }

  res.setHeader('Content-Length', stat.size);
  return fs.createReadStream(abs).pipe(res);
});

module.exports = router;
module.exports.AUDIO_DIR = AUDIO_DIR;
module.exports.MOUNT = FEI_PREFIX; // '/api/audio/fei/'
