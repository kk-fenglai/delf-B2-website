// Google Ads (gtag.js) helpers. The base tag lives in index.html <head>;
// here we only fire conversion events. `gtag` is loaded globally by that tag,
// so guard against it being missing (e.g. blocked by an ad blocker).
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Google Ads "购买" conversion action for this account.
const PURCHASE_CONVERSION = 'AW-18340546644/uLr7CLKG5tUcENSQuqlE';

// Fire the purchase conversion once payment is confirmed. `transaction_id`
// lets Google Ads de-duplicate, so a page refresh won't double-count.
export function trackPurchaseConversion(orderId?: string | null) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'conversion', {
    send_to: PURCHASE_CONVERSION,
    value: 1.0,
    currency: 'EUR',
    transaction_id: orderId || '',
  });
}

export {};
