// Shared helpers and small components for the admin payment dashboard.
//
// The admin pages elsewhere in the codebase still hard-code Chinese strings;
// the new payment dashboard is i18n-aware via `useTranslation('translation')`
// and the keys live under the `adminPayments.*` namespace. Everything that
// would otherwise need to be re-implemented in every panel goes here so the
// individual files stay focused on layout.

import { useEffect, useState } from 'react';
import { Button, Grid, message, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

// --------------------------------------------------------------------
// Domain types shared across panels
// --------------------------------------------------------------------

export type Provider = 'wechat' | 'alipay' | 'stripe';

export type OrderStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'CLOSED'
  | 'REFUNDED'
  | 'FAILED';

export type ContractStatus = 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'SUSPENDED';

export interface PriceRow {
  id: string;
  code: string;
  /** Optional human-readable label (does not replace unique `code`). */
  name: string | null;
  months: number;
  currency: string;
  amountCents: number;
  supportsAutoRenew: boolean;
  active: boolean;
  stripePriceId: string | null;
  stripeMappings?: Array<{ currency: string; stripePriceId: string }>;
}

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  plan: string;
  active: boolean;
  prices: PriceRow[];
}

export interface RefundRow {
  id: string;
  amountCents: number;
  reason: string | null;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  externalRefundNo: string | null;
  createdAt: string;
}

export interface PaymentOrderRow {
  id: string;
  userId: string;
  provider: Provider;
  product: string;
  plan: string;
  months: number;
  currency: string;
  amountCents: number;
  refundedCents: number;
  status: OrderStatus;
  providerOrderNo: string | null;
  externalTradeNo: string | null;
  createdAt: string;
  paidAt: string | null;
  user?: { id: string; email: string; name: string | null };
  price?: { code: string; months: number; amountCents: number } | null;
}

export interface ContractRow {
  id: string;
  provider: Provider;
  status: ContractStatus;
  externalContractId: string;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  nextChargeAt: string | null;
  lastChargeAt: string | null;
  failedCount: number;
  createdAt: string;
  user?: { id: string; email: string; name: string | null; plan: string };
  price?: {
    code: string;
    months: number;
    amountCents: number;
    currency?: string;
    product?: { code: string; name: string };
  } | null;
}

// --------------------------------------------------------------------
// Currency helpers
// --------------------------------------------------------------------

export const SUPPORTED_CURRENCIES = ['CNY', 'USD', 'EUR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
};

export function currencySymbol(code: string | null | undefined): string {
  if (!code) return '';
  return CURRENCY_SYMBOL[code] ?? `${code} `;
}

// Formats a cents amount for display. Drops the trailing `.00` for whole
// units to match how prices are normally written for marketing copy.
export function formatMoney(cents: number, currency = 'CNY'): string {
  const sym = currencySymbol(currency);
  const v = (cents / 100).toFixed(2).replace(/\.00$/, '');
  return `${sym}${v}`;
}

// --------------------------------------------------------------------
// Date helpers
// --------------------------------------------------------------------

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// --------------------------------------------------------------------
// Components
// --------------------------------------------------------------------

interface CopyButtonProps {
  text: string;
  size?: 'small' | 'middle';
  tooltip?: string;
}

// Compact icon-only button that copies a string to the clipboard. Falls
// back to `document.execCommand('copy')` on browsers/contexts where the
// async clipboard API is unavailable (most non-https admin previews).
export function CopyButton({ text, size = 'small', tooltip }: CopyButtonProps) {
  return (
    <Tooltip title={tooltip ?? 'Copy'}>
      <Button
        size={size}
        type="text"
        icon={<CopyOutlined />}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(text);
            } else {
              const ta = document.createElement('textarea');
              ta.value = text;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            message.success('Copied');
          } catch {
            message.error('Copy failed');
          }
        }}
      />
    </Tooltip>
  );
}

interface MoneyProps {
  cents: number;
  currency?: string;
  className?: string;
}

// Right-aligned currency value with tabular figures so columns line up.
export function Money({ cents, currency, className }: MoneyProps) {
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(cents, currency || 'CNY')}
    </span>
  );
}

// --------------------------------------------------------------------
// Admin password session caching
// --------------------------------------------------------------------
//
// `X-Admin-Password` is required for sensitive endpoints (refund). Asking
// every single time during a refund batch is annoying; we cache it inside
// `sessionStorage` so it lives only as long as the browser tab.

const PW_SESSION_KEY = 'delfluent-admin-pw-session';

interface AdminPasswordSession {
  password: string;
  remembered: boolean;
  setPassword: (pw: string) => void;
  remember: (pw: string) => void;
  clear: () => void;
}

export function useAdminPasswordSession(): AdminPasswordSession {
  const initial = typeof window !== 'undefined' ? sessionStorage.getItem(PW_SESSION_KEY) || '' : '';
  const [password, setPasswordState] = useState(initial);
  const [remembered, setRemembered] = useState(Boolean(initial));

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === PW_SESSION_KEY) {
        setPasswordState(e.newValue || '');
        setRemembered(Boolean(e.newValue));
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    password,
    remembered,
    setPassword: (pw: string) => setPasswordState(pw),
    remember: (pw: string) => {
      sessionStorage.setItem(PW_SESSION_KEY, pw);
      setPasswordState(pw);
      setRemembered(true);
    },
    clear: () => {
      sessionStorage.removeItem(PW_SESSION_KEY);
      setPasswordState('');
      setRemembered(false);
    },
  };
}

// --------------------------------------------------------------------
// External link helpers
// --------------------------------------------------------------------

// Constructs a Stripe Dashboard URL for a subscription or payment intent.
// Falls back to live mode (no `/test/` segment) since we have no signal
// here whether the cluster is talking to test or live keys; admins can
// flip themselves once they are inside the dashboard.
export function stripeDashboardUrl(
  kind: 'subscription' | 'payment_intent' | 'customer',
  id: string,
  testMode = false,
): string {
  const root = `https://dashboard.stripe.com${testMode ? '/test' : ''}`;
  switch (kind) {
    case 'subscription':
      return `${root}/subscriptions/${id}`;
    case 'payment_intent':
      return `${root}/payments/${id}`;
    case 'customer':
      return `${root}/customers/${id}`;
  }
}

// --------------------------------------------------------------------
// Status colours (Ant tag colour keys)
// --------------------------------------------------------------------

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  CREATED: 'default',
  PENDING: 'processing',
  PAID: 'success',
  CLOSED: 'default',
  REFUNDED: 'warning',
  FAILED: 'error',
};

export const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  PENDING: 'default',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'default',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  wechat: 'WeChat',
  alipay: 'Alipay',
  stripe: 'Stripe',
};

const { useBreakpoint } = Grid;

/** Full-width drawer on phone; fixed width on desktop. */
export function useAdminDrawerWidth(desktop = 480): number | string {
  const screens = useBreakpoint();
  return screens.md ? desktop : '100%';
}
