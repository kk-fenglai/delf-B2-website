import { create } from 'zustand';
import { api } from '../api/client';
import type { ExamSystem, Level, LevelPublicConfig, SystemPublicConfig } from '../types';

// Exam-level state. `level` is the level the user is currently browsing
// (persisted so it survives reload); `catalogue` is the DELF subtree of the
// GET /api/catalogue payload fetched once per app load (like fetchGeo in
// App.tsx). `systems` is the full system tree — it lists a non-DELF system
// only once that system has published content, so `systems.length >= 2` is
// the render condition for a future SystemSwitcher (progressive disclosure).
//
// IMPORTANT for runners (ExamRunner / SpeakingExam): the AUTHORITATIVE
// system+level for a loaded exam is `exam.system`/`exam.level` from
// GET /api/exams/:id — a deep link to another system/level's set must follow
// the exam and call setLevel/setSystem to reconcile, never the other way round.
interface LevelState {
  system: ExamSystem;
  level: Level;
  systems: SystemPublicConfig[] | null;
  catalogue: LevelPublicConfig[] | null;
  defaultLevel: Level;
  loaded: boolean;
  setSystem: (system: ExamSystem) => void;
  setLevel: (level: Level) => void;
  fetchCatalogue: () => Promise<void>;
}

const STORAGE_KEY = 'delfluent-level';
const SYSTEM_STORAGE_KEY = 'delfluent-system';

function storedLevel(): Level {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'B2' || v === 'B1' || v === 'A2') return v;
  } catch { /* private mode etc. */ }
  return 'B2';
}

function storedSystem(): ExamSystem {
  try {
    const v = localStorage.getItem(SYSTEM_STORAGE_KEY);
    if (v === 'DELF' || v === 'IELTS') return v;
  } catch { /* private mode etc. */ }
  return 'DELF';
}

// 跨体系查找 level 公开配置：IELTS 级别只存在于 systems 树，不在 DELF catalogue。
export function findLevelConfig(
  systems: SystemPublicConfig[] | null,
  catalogue: LevelPublicConfig[] | null,
  levelKey: string,
): LevelPublicConfig | undefined {
  for (const sys of systems ?? []) {
    const hit = sys.levels.find((l) => l.key === levelKey);
    if (hit) return hit;
  }
  return catalogue?.find((l) => l.key === levelKey);
}

export const useLevelStore = create<LevelState>((set, get) => ({
  system: storedSystem(),
  level: storedLevel(),
  systems: null,
  catalogue: null,
  defaultLevel: 'B2',
  loaded: false,
  setSystem: (system) => {
    if (system === get().system) return;
    try { localStorage.setItem(SYSTEM_STORAGE_KEY, system); } catch { /* ignore */ }
    // Landing level for the target system: DELF restores the user's stored
    // DELF level (localStorage keeps it); other systems use their default.
    const sys = get().systems?.find((s) => s.key === system);
    const level = (system === 'DELF' ? storedLevel() : sys?.defaultLevel ?? get().level) as Level;
    set({ system, level });
  },
  setLevel: (level) => {
    // Only the DELF level choice is persisted — it doubles as the "remembered
    // DELF level" restored when the user switches back from another system.
    if (get().system === 'DELF') {
      try { localStorage.setItem(STORAGE_KEY, level); } catch { /* ignore */ }
    }
    set({ level });
  },
  fetchCatalogue: async () => {
    if (get().loaded) return;
    try {
      const { data } = await api.get('/catalogue');
      const systems: SystemPublicConfig[] = data?.systems ?? [];
      const delf = systems.find((s) => s.key === 'DELF');
      const catalogue: LevelPublicConfig[] = delf?.levels ?? [];
      const defaultLevel: Level = (delf?.defaultLevel as Level) ?? 'B2';
      const patch: Partial<LevelState> = { systems, catalogue, defaultLevel, loaded: true };
      // If the stored system is no longer served (e.g. IELTS content pulled),
      // fall back to DELF; same rule as levels below.
      if (systems.length && !systems.some((s) => s.key === get().system)) {
        patch.system = 'DELF';
      }
      // If the stored level no longer exists in the catalogue (e.g. a level
      // was pulled), fall back to the server default rather than 404-ing.
      const effectiveSystem = patch.system ?? get().system;
      if (effectiveSystem === 'DELF' && catalogue.length && !catalogue.some((l) => l.key === get().level)) {
        patch.level = defaultLevel;
      }
      set(patch);
    } catch {
      try {
        // Old backend without /api/catalogue: fall back to GET /api/levels
        // (pure-DELF behaviour, identical to the pre-systems store).
        const { data } = await api.get('/levels');
        const catalogue: LevelPublicConfig[] = data?.levels ?? [];
        const defaultLevel: Level = data?.defaultLevel ?? 'B2';
        const patch: Partial<LevelState> = { catalogue, defaultLevel, loaded: true, system: 'DELF' };
        if (catalogue.length && !catalogue.some((l) => l.key === get().level)) {
          patch.level = defaultLevel;
        }
        set(patch);
      } catch {
        // Fail open: B2-only behaviour, same as before this store existed.
        set({ catalogue: null, loaded: true });
      }
    }
  },
}));
