import { create } from 'zustand';
import { api } from '../api/client';
import type { Level, LevelPublicConfig } from '../types';

// Exam-level state. `level` is the level the user is currently browsing
// (persisted so it survives reload); `catalogue` is the GET /api/levels
// payload fetched once per app load (like fetchGeo in App.tsx).
//
// IMPORTANT for runners (ExamRunner / SpeakingExam): the AUTHORITATIVE level
// for a loaded exam is `exam.level` from GET /api/exams/:id — a deep link to
// another level's set must follow the exam and call setLevel to reconcile,
// never the other way round.
interface LevelState {
  level: Level;
  catalogue: LevelPublicConfig[] | null;
  defaultLevel: Level;
  loaded: boolean;
  setLevel: (level: Level) => void;
  fetchCatalogue: () => Promise<void>;
}

const STORAGE_KEY = 'delfluent-level';

function storedLevel(): Level {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'B2' || v === 'B1' || v === 'A2') return v;
  } catch { /* private mode etc. */ }
  return 'B2';
}

export const useLevelStore = create<LevelState>((set, get) => ({
  level: storedLevel(),
  catalogue: null,
  defaultLevel: 'B2',
  loaded: false,
  setLevel: (level) => {
    try { localStorage.setItem(STORAGE_KEY, level); } catch { /* ignore */ }
    set({ level });
  },
  fetchCatalogue: async () => {
    if (get().loaded) return;
    try {
      const { data } = await api.get('/levels');
      const catalogue: LevelPublicConfig[] = data?.levels ?? [];
      const defaultLevel: Level = data?.defaultLevel ?? 'B2';
      const patch: Partial<LevelState> = { catalogue, defaultLevel, loaded: true };
      // If the stored level no longer exists in the catalogue (e.g. a level
      // was pulled), fall back to the server default rather than 404-ing.
      if (catalogue.length && !catalogue.some((l) => l.key === get().level)) {
        patch.level = defaultLevel;
      }
      set(patch);
    } catch {
      // Fail open: B2-only behaviour, same as before this store existed.
      set({ catalogue: null, loaded: true });
    }
  },
}));
