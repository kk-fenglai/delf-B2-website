import { useEffect, useState } from 'react';
import { Card, Button, Tag, message, Skeleton } from 'antd';
import { ArrowUpOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

// Higher tiers reachable from each paid plan. FREE / AI_UNLIMITED → nothing.
const UPGRADE_TARGETS: Record<string, string[]> = {
  STANDARD: ['AI', 'AI_UNLIMITED'],
  AI: ['AI_UNLIMITED'],
};

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', EUR: '€', USD: '$', GBP: '£' };

function money(cents: number, currency: string) {
  const sym = CURRENCY_SYMBOL[currency] || `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

type Quote = {
  eligible: boolean;
  reason?: string;
  toPlan: string;
  fromPlan: string;
  currency: string;
  amountCents: number;
  remainingDays: number;
};

/**
 * Shows prorated "pay the difference" upgrade options for an active paid
 * subscriber. Renders nothing for FREE / top-tier users or when no eligible
 * upgrade exists (server decides eligibility).
 */
export default function UpgradeDifferenceCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const plan = user?.effectivePlan || user?.plan || 'FREE';
  const targets = UPGRADE_TARGETS[plan] || [];

  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user || targets.length === 0) { setQuotes([]); return; }
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        targets.map((p) =>
          api.get('/pay/stripe/upgrade/quote', { params: { plan: p } })
            .then((r) => r.data as Quote)
            .catch(() => null),
        ),
      );
      // Keep eligible upgrades (buttons) AND below-min ones (info note).
      if (!cancelled) {
        setQuotes(results.filter((q): q is Quote => !!q && (q.eligible || q.reason === 'BELOW_MIN_CHARGE')));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, plan]);

  if (!user || targets.length === 0) return null;
  if (quotes === null) return <Card className="mb-4"><Skeleton active paragraph={{ rows: 2 }} /></Card>;
  if (quotes.length === 0) return null;

  const startUpgrade = async (toPlan: string) => {
    setBusy(toPlan);
    try {
      const { data } = await api.post('/pay/stripe/upgrade-checkout', { plan: toPlan });
      if (data?.checkoutMode === 'embedded' && data?.clientSecret) {
        navigate('/checkout/stripe', {
          state: { clientSecret: data.clientSecret, orderId: data.orderId, sessionId: data.sessionId },
        });
        return;
      }
      if (data?.redirectUrl) { window.location.href = data.redirectUrl; return; }
      message.error(t('pricing.checkout.createFailed'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || t('pricing.checkout.createFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      className="mb-4"
      style={{ borderColor: '#2563eb', borderWidth: 1 }}
      title={<span><ArrowUpOutlined className="mr-2" />{t('pricing.upgrade.title')}</span>}
    >
      <p className="text-gray-500 mb-3">{t('pricing.upgrade.desc')}</p>
      <div className="flex flex-col gap-3">
        {quotes.map((q) => (
          <div key={q.toPlan} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded" style={{ background: 'var(--primarySoftA, #eff6ff)' }}>
            <div>
              <Tag color="purple">{t(`plan.${q.toPlan}`)}</Tag>
              {q.eligible ? (
                <>
                  <span className="ml-2 text-lg font-semibold">{money(q.amountCents, q.currency)}</span>
                  <span className="ml-2 text-gray-500 text-sm">
                    {t('pricing.upgrade.remaining', { days: q.remainingDays })}
                  </span>
                </>
              ) : (
                <span className="ml-2 text-gray-500 text-sm">{t('pricing.upgrade.belowMin')}</span>
              )}
            </div>
            {q.eligible && (
              <Button type="primary" loading={busy === q.toPlan} onClick={() => startUpgrade(q.toPlan)}>
                {t('pricing.upgrade.cta', { plan: t(`plan.${q.toPlan}`) })}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
