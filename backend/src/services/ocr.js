const Tesseract = require('tesseract.js');
const { logger } = require('../utils/logger');

// OCR is CPU-heavy and tesseract.js worker init is expensive.
// We keep a single worker and serialize jobs to avoid memory spikes.

let workerPromise = null;
let chain = Promise.resolve();

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker({
        logger: (m) => {
          // Keep logs sparse: only report major phases in debug level
          if (m?.status && (m.status === 'initializing tesseract' || m.status === 'recognizing text')) {
            logger.debug({ ocr: m }, 'ocr.progress');
          }
        },
      });
      return worker;
    })();
  }
  return workerPromise;
}

function normaliseLang(lang) {
  // tesseract.js lang codes: 'fra', 'eng', etc.
  if (lang === 'fr' || lang === 'fra') return 'fra';
  if (lang === 'en' || lang === 'eng') return 'eng';
  if (lang === 'zh' || lang === 'chi_sim' || lang === 'chi_tra') return 'chi_sim';
  // allow combined langs like "fra+eng"
  if (typeof lang === 'string' && /^[a-z_+]+$/i.test(lang)) return lang;
  return 'fra';
}

async function recogniseImage(buffer, { lang = 'fra' } = {}) {
  const usedLang = normaliseLang(lang);
  const worker = await getWorker();

  // Serialize recognition tasks.
  const run = async () => {
    try {
      await worker.loadLanguage(usedLang);
      await worker.initialize(usedLang);
      const result = await worker.recognize(buffer);
      const text = (result?.data?.text || '').replace(/\r\n/g, '\n').trim();
      const confidence = typeof result?.data?.confidence === 'number' ? result.data.confidence : null;
      return { text, confidence, lang: usedLang };
    } catch (err) {
      logger.error({ err }, 'ocr.recognize.fail');
      throw err;
    }
  };

  chain = chain.then(run, run);
  return chain;
}

module.exports = { recogniseImage };

