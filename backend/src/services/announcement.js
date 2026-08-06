const prisma = require('../prisma');

// Site-wide announcement shown to signed-in users. Stored in AppSetting so an
// admin can edit and toggle it without a deploy (same pattern as billingPolicy).
const SETTING_KEY = 'announcement';

const LOCALES = ['zh', 'en', 'fr'];
const MAX_TITLE = 120;
const MAX_BODY = 1000;

const DEFAULT_TITLE = {
  zh: '本次更新',
  en: "What's new",
  fr: 'Nouveautés',
};

const DEFAULT_BODY = {
  zh: '我们重做了整站界面，并优化了访问速度。如果你有任何意见或建议，欢迎点击右下角的反馈按钮告诉我们。',
  en: 'We have redesigned the interface and improved loading speed. If you have any feedback, use the button in the bottom-right corner to tell us.',
  fr: "Nous avons repensé l'interface et amélioré la vitesse de chargement. Pour tout retour, utilisez le bouton en bas à droite.",
};

let cache = { at: 0, announcement: null };
const CACHE_TTL_MS = 15_000;

function defaults() {
  return {
    // On by default: with no AppSetting row yet, the launch notice shows as
    // soon as this ships. An admin save always overrides this.
    enabled: true,
    title: { ...DEFAULT_TITLE },
    body: { ...DEFAULT_BODY },
  };
}

// Keep only known locales and trim to the stored length limits.
function normalizeText(raw, fallback, maxLen) {
  const out = { ...fallback };
  if (raw && typeof raw === 'object') {
    for (const loc of LOCALES) {
      if (typeof raw[loc] === 'string') out[loc] = raw[loc].trim().slice(0, maxLen);
    }
  }
  return out;
}

function normalizeAnnouncement(raw, updatedAt) {
  const base = defaults();
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: source.enabled !== undefined ? Boolean(source.enabled) : base.enabled,
    title: normalizeText(source.title, base.title, MAX_TITLE),
    body: normalizeText(source.body, base.body, MAX_BODY),
    // Bumps whenever the row is written; the client uses it to re-show an
    // announcement whose wording changed.
    version: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
}

function invalidateAnnouncementCache() {
  cache = { at: 0, announcement: null };
}

async function getAnnouncement() {
  if (cache.announcement && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.announcement;
  }
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const announcement = normalizeAnnouncement(row?.value, row?.updatedAt);
  cache = { at: Date.now(), announcement };
  return announcement;
}

async function saveAnnouncement(patch, { adminId } = {}) {
  const current = await getAnnouncement();
  const next = normalizeAnnouncement({
    enabled: patch.enabled ?? current.enabled,
    title: { ...current.title, ...(patch.title || {}) },
    body: { ...current.body, ...(patch.body || {}) },
  });

  const toStore = { enabled: next.enabled, title: next.title, body: next.body };

  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: toStore },
    update: { value: toStore },
  });
  invalidateAnnouncementCache();

  return { ...(await getAnnouncement()), savedBy: adminId || null };
}

module.exports = {
  SETTING_KEY,
  getAnnouncement,
  saveAnnouncement,
  invalidateAnnouncementCache,
};
