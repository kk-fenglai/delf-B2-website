const env = require('../config/env');

const DEFAULT_R2_ORIGIN = 'https://pub-72b0969c5978483fb68d6403d707896a.r2.dev';

/** Rewrite legacy R2 public URLs to a custom CDN origin when configured. */
function rewriteAudioCdnUrl(audioUrl) {
  if (!audioUrl || typeof audioUrl !== 'string') return audioUrl || null;
  const target = env.AUDIO_CDN_ORIGIN;
  if (!target) return audioUrl;
  const from = (env.AUDIO_CDN_REPLACE_FROM || DEFAULT_R2_ORIGIN).replace(/\/$/, '');
  const to = target.replace(/\/$/, '');
  if (!audioUrl.startsWith(from)) return audioUrl;
  return to + audioUrl.slice(from.length);
}

module.exports = { rewriteAudioCdnUrl, DEFAULT_R2_ORIGIN };
