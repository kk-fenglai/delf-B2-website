import type { SystemPublicConfig } from '../types';

// slug ↔ system skill key. Slugs (listening/reading/writing/speaking) are the
// URL layer shared by every exam system; the internal keys differ (DELF
// CO/CE/PE/PO vs IELTS LISTENING/READING/WRITING/SPEAKING). The DELF map is
// the fallback so routes work before the catalogue loads (and on old bundles).
const DELF_SLUG_TO_SKILL: Record<string, string> = {
  listening: 'CO',
  reading: 'CE',
  writing: 'PE',
  speaking: 'PO',
};

export function slugToSkill(system: SystemPublicConfig | null | undefined, slug: string): string {
  return system?.skills.find((s) => s.slug === slug)?.key ?? DELF_SLUG_TO_SKILL[slug] ?? slug;
}

export function skillToSlug(system: SystemPublicConfig | null | undefined, key: string): string {
  const fromSystem = system?.skills.find((s) => s.key === key)?.slug;
  if (fromSystem) return fromSystem;
  const entry = Object.entries(DELF_SLUG_TO_SKILL).find(([, k]) => k === key);
  return entry ? entry[0] : key.toLowerCase();
}
