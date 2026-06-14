import { create } from 'zustand';
import { api } from '../api/client';

// Lightweight country detection used to gate region-specific UI. The country
// comes from the edge proxy's IP header, surfaced by the public
// /api/pay/preferred-currency endpoint (no auth required).
interface GeoState {
  country: string | null;
  loaded: boolean;
  fetchGeo: () => Promise<void>;
}

export const useGeoStore = create<GeoState>((set, get) => ({
  country: null,
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
        set({ country: override.toUpperCase(), loaded: true });
        return;
      }
    }
    try {
      const { data } = await api.get('/pay/preferred-currency');
      set({ country: data?.country ?? null, loaded: true });
    } catch {
      // Fail open: if detection fails we leave country null so callers
      // default to showing the standard (non-restricted) UI.
      set({ country: null, loaded: true });
    }
  },
}));

// Paid plan tiers are hidden from mainland-China IPs during the beta. The
// pricing page stays reachable, but those visitors see a "coming soon"
// notice instead of the paid cards.
export function isPaidPlansHidden(country: string | null): boolean {
  return country === 'CN';
}
