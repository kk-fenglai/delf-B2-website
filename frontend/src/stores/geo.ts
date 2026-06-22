import { create } from 'zustand';
import { api } from '../api/client';

// Lightweight country detection used to gate region-specific UI. The country
// comes from the edge proxy's IP header, surfaced by the public
// /api/pay/preferred-currency endpoint (no auth required).
interface GeoState {
  country: string | null;
  // True when the visitor's country is on the admin-configured free list
  // (default: mainland China). Such visitors use the platform for free and
  // see no paid plans. Server-decided (via /pay/preferred-currency) so the
  // country list stays admin-editable in one place.
  freeCountry: boolean;
  loaded: boolean;
  fetchGeo: () => Promise<void>;
}

export const useGeoStore = create<GeoState>((set, get) => ({
  country: null,
  freeCountry: false,
  loaded: false,
  fetchGeo: async () => {
    if (get().loaded) return;
    // Dev-only preview override: append ?geo=CN (or any ISO code) to the URL
    // to simulate that country without a matching IP. Stripped from
    // production builds via import.meta.env.DEV, so it can't be used to
    // bypass the restriction on the live site.
    if (import.meta.env.DEV) {
      const override = new URLSearchParams(window.location.search).get('geo');
      if (override) {
        const cc = override.toUpperCase();
        set({ country: cc, freeCountry: cc === 'CN', loaded: true });
        return;
      }
    }
    try {
      const { data } = await api.get('/pay/preferred-currency');
      set({ country: data?.country ?? null, freeCountry: Boolean(data?.freeCountry), loaded: true });
    } catch {
      // Fail open: if detection fails we leave country null / not-free so
      // callers default to showing the standard (paid) UI.
      set({ country: null, freeCountry: false, loaded: true });
    }
  },
}));
