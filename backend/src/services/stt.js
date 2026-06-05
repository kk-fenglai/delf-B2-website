// Speech-to-text for DELF B2 oral recordings.
//
// Provider: OpenAI Whisper (api.openai.com). Default model is `whisper-1`
// which has excellent French support; override via OPENAI_ASR_MODEL env var.
//
// Contract: transcribeFile(path, { language }) → { text, model }.
// Caller (oralQueue) is responsible for persistence; this module is pure I/O.
//
// Errors are tagged with a `code` so the queue can decide retry vs terminal:
//   STT_NOT_CONFIGURED  — env keys missing (caller will mark error)
//   STT_RATE_LIMITED    — 429, transient
//   STT_PROVIDER_DOWN   — 5xx, transient
//   STT_BAD_AUDIO       — 4xx, terminal (file invalid / unsupported)
//   STT_CALL_FAILED     — generic network failure, transient
//   STT_EMPTY           — model returned no text (terminal — likely silence)

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const env = require('../config/env');
const { logger } = require('../utils/logger');

const DEFAULT_MODEL = process.env.OPENAI_ASR_MODEL || 'whisper-1';
const SDK_TIMEOUT_MS = Number(process.env.OPENAI_ASR_TIMEOUT_MS || 60_000);
const MAX_RETRIES = 1;

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!env.OPENAI_API_KEY) {
    const e = new Error('OPENAI_API_KEY not configured');
    e.code = 'STT_NOT_CONFIGURED';
    throw e;
  }
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

function classifyError(err) {
  if (err?.code && typeof err.code === 'string' && err.code.startsWith('STT_')) return err;
  const status = err?.status || err?.response?.status;
  let code = 'STT_CALL_FAILED';
  if (status === 429) code = 'STT_RATE_LIMITED';
  else if (status >= 500) code = 'STT_PROVIDER_DOWN';
  else if (status >= 400) code = 'STT_BAD_AUDIO';
  const wrapped = new Error(`STT failed: ${err?.message || err}`);
  wrapped.code = code;
  wrapped.cause = err;
  return wrapped;
}

async function withRetry(fn) {
  let lastErr;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      // Terminal 4xx (except 429) → don't retry.
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      if (i === MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 300));
    }
  }
  throw lastErr;
}

/**
 * Transcribe a local audio file. Returns plain text + the model that produced
 * it. Audio shorter than ~1s or essentially silent will return an empty string;
 * callers should treat that as STT_EMPTY (we throw it explicitly).
 *
 * @param {string} filePath  absolute path to a webm/opus/mp4/m4a/wav file
 * @param {object} opts
 * @param {string} [opts.language='fr']  ISO-639-1 hint
 * @param {string} [opts.model]          override DEFAULT_MODEL
 * @returns {Promise<{ text: string, model: string }>}
 */
async function transcribeFile(filePath, { language = 'fr', model } = {}) {
  if (!fs.existsSync(filePath)) {
    const e = new Error(`Audio file not found: ${filePath}`);
    e.code = 'STT_BAD_AUDIO';
    throw e;
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    const e = new Error('Audio file is empty');
    e.code = 'STT_BAD_AUDIO';
    throw e;
  }

  const client = getClient();
  const useModel = model || DEFAULT_MODEL;
  const started = Date.now();

  try {
    const resp = await withRetry(() =>
      client.audio.transcriptions.create(
        {
          file: fs.createReadStream(filePath),
          model: useModel,
          // OpenAI-compat APIs accept ISO-639-1; DashScope uses the same field.
          language,
          // `verbose_json` would surface durations; keep `text` for portability.
          response_format: 'text',
        },
        { timeout: SDK_TIMEOUT_MS }
      )
    );

    // SDK returns either `{ text }` (json modes) or the raw string (text mode).
    const text = typeof resp === 'string' ? resp : (resp?.text || '');
    const trimmed = String(text).trim();

    logger.info(
      {
        file: path.basename(filePath),
        size: stat.size,
        model: useModel,
        chars: trimmed.length,
        latencyMs: Date.now() - started,
      },
      'stt.transcribe.done'
    );

    if (!trimmed) {
      const e = new Error('STT returned empty transcript (possibly silence)');
      e.code = 'STT_EMPTY';
      throw e;
    }

    return { text: trimmed, model: useModel };
  } catch (err) {
    if (err?.code === 'STT_EMPTY') throw err;
    throw classifyError(err);
  }
}

module.exports = {
  transcribeFile,
  // exported for tests
  _internal: { DEFAULT_MODEL, classifyError },
};
