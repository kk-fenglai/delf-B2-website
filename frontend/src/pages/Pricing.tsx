import { useEffect, useMemo, useState } from 'react';
import {
  Typography, Button, Modal, Segmented, Space, message, Checkbox, Skeleton,
} from 'antd';
import {
  CheckOutlined, SafetyCertificateOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import type { CatalogProduct, CatalogPrice, Plan } from '../types';

const { Title, Paragraph } = Typography;

type BillingCycle = 'monthly' | 'yearly';

const FREE_CARD_KEY = 'free';

// Maps an ISO currency code to its display symbol. Falls back to the code
// itself with a trailing space (e.g. "GBP 12.34") so unknown currencies stay
// readable instead of silently appearing as bare numbers.
const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };

function formatPrice(cents: number, currency: string | null | undefined): string {
  const sym = currency ? (CURRENCY_SYMBOL[currency] ?? `${currency} `) : '¥';
  const v = (cents / 100).toFixed(2).replace(/\.00$/, '');
  return `${sym}${v}`;
}

export default function Pricing() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const [open, setOpen] = useState(false);
  const [buyingProduct, setBuyingProduct] = useState<CatalogProduct | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<CatalogPrice | null>(null);
  const [enableAutoRenew, setEnableAutoRenew] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLoggedIn = !!user;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/pay/products');
        if (!cancelled) setProducts(data.products || []);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function priceForCycle(product: CatalogProduct, c: BillingCycle): CatalogPrice | null {
    const months = c === 'monthly' ? 1 : 12;
    return product.prices.find((p) => p.months === months) || null;
  }

  function openCheckout(product: CatalogProduct) {
    if (!isLoggedIn) {
      message.info(t('pricing.checkout.loginFirst'));
      return;
    }
    const price = priceForCycle(product, cycle);
    if (!price) {
      message.error(t('pricing.checkout.createFailed'));
      return;
    }
    setBuyingProduct(product);
    setSelectedPrice(price);
    setEnableAutoRenew(false);
    setOpen(true);
  }

  const priceLabel = selectedPrice ? formatPrice(selectedPrice.amountCents, selectedPrice.currency) : '—';
  const periodLabel = selectedPrice
    ? (selectedPrice.months === 1 ? t('pricing.checkout.perMonth') : t('pricing.checkout.perYear'))
    : '';

  async function doCreateOrder() {
    if (!selectedPrice) return;
    setLoading(true);
    try {
      const subscribe = enableAutoRenew && !!selectedPrice.supportsAutoRenew && selectedPrice.months === 1;
      const { data } = await api.post('/pay/stripe/checkout', {
        priceId: selectedPrice.id,
        subscribe,
      });
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      message.error(t('pricing.checkout.createFailed'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || t('pricing.checkout.createFailed'));
    } finally {
      setLoading(false);
    }
  }

  const cards = useMemo(() => {
    const free = { key: FREE_CARD_KEY, plan: 'FREE' as Plan, product: null as CatalogProduct | null };
    const paid = (products || []).map((p) => ({
      key: p.plan.toLowerCase(),
      plan: p.plan as Plan,
      product: p,
    }));
    return [free, ...paid];
  }, [products]);

  function featuresFor(key: string): string[] {
    const raw = t(`pricing.plans.${key}.features`, { returnObjects: true });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <Title level={2} style={{ marginBottom: 8 }}>{t('pricing.title')}</Title>
        <Paragraph style={{ color: 'var(--textMuted)', marginBottom: 0, fontSize: 16 }}>
          {t('pricing.subtitle')}
        </Paragraph>
      </div>

      <div className="flex justify-center mb-10">
        <Segmented
          value={cycle}
          onChange={(v) => setCycle(v as BillingCycle)}
          size="large"
          options={[
            { label: t('pricing.checkout.monthly'), value: 'monthly' },
            { label: t('pricing.checkout.yearly'), value: 'yearly' },
          ]}
        />
      </div>

      {catalogLoading ? (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-6"
              style={{
                background: '#ffffff',
                boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
              }}
            >
              <Skeleton active />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
          {cards.map((c) => {
            const isFree = c.key === FREE_CARD_KEY;
            const highlight = c.key === 'ai';
            const price = c.product ? priceForCycle(c.product, cycle) : null;
            const features = featuresFor(c.key);
            const name = t(`pricing.plans.${c.key}.name`, c.product?.name || '');

            const priceText = isFree
              ? t('pricing.plans.free.price')
              : price ? formatPrice(price.amountCents, price.currency) : '—';
            const periodText = isFree
              ? t('pricing.plans.free.period')
              : price ? (cycle === 'monthly'
                  ? t('pricing.checkout.perMonth')
                  : t('pricing.checkout.perYear'))
                : '';

            return (
              <div
                key={c.key}
                className="relative rounded-2xl p-7 flex flex-col h-full"
                style={{
                  background: highlight
                    ? 'linear-gradient(180deg, #eff6ff 0%, #ffffff 40%)'
                    : '#ffffff',
                  boxShadow: highlight
                    ? '0 18px 50px rgba(37, 99, 235, 0.18)'
                    : '0 6px 18px rgba(15, 23, 42, 0.06)',
                }}
              >
                {highlight && (
                  <div
                    className="absolute top-5 right-5 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: '#2563eb', color: '#ffffff', letterSpacing: '0.02em' }}
                  >
                    {t('pricing.popular')}
                  </div>
                )}

                <div
                  className="text-base font-semibold mb-4"
                  style={{ color: 'var(--text)' }}
                >
                  {name}
                </div>

                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold" style={{ color: 'var(--text)' }}>
                    {priceText}
                  </span>
                  {periodText && (
                    <span className="text-sm" style={{ color: 'var(--textMuted)' }}>
                      {periodText}
                    </span>
                  )}
                </div>
                {!isFree && price?.name && (
                  <div className="text-sm mb-4 -mt-2" style={{ color: 'var(--textMuted)' }}>
                    {price.name}
                  </div>
                )}

                <div className="space-y-2.5 mb-6 flex-grow">
                  {features.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckOutlined
                        style={{ color: '#2563eb', marginTop: 4, fontSize: 12, flexShrink: 0 }}
                      />
                      <span style={{ color: 'var(--text)' }}>{f}</span>
                    </div>
                  ))}
                </div>

                {isFree ? (
                  <Link to="/register">
                    <Button
                      block
                      size="large"
                      style={{
                        background: 'rgba(37, 99, 235, 0.08)',
                        color: '#2563eb',
                        fontWeight: 600,
                      }}
                    >
                      {t('pricing.plans.free.cta')}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    type={highlight ? 'primary' : 'default'}
                    block
                    size="large"
                    disabled={!price}
                    onClick={() => c.product && openCheckout(c.product)}
                    style={
                      highlight
                        ? { fontWeight: 600 }
                        : {
                            background: 'rgba(37, 99, 235, 0.08)',
                            color: '#2563eb',
                            fontWeight: 600,
                          }
                    }
                  >
                    {t('pricing.checkout.buyNow')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        className="text-center mt-10 text-sm"
        style={{ color: 'var(--textMuted)' }}
      >
        {t('pricing.paymentNote')}
      </div>

      <Modal
        title={t('pricing.checkout.title')}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnClose
        width={460}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div
            className="flex items-start justify-between gap-3 rounded-xl p-4"
            style={{ background: 'rgba(37, 99, 235, 0.06)' }}
          >
            <div>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>
                {buyingProduct?.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--textMuted)' }}>
                {selectedPrice ? periodLabel : ''}
                {selectedPrice?.name ? ` · ${selectedPrice.name}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold" style={{ color: '#2563eb' }}>
                {priceLabel}
              </div>
              <div
                className="text-xs flex items-center justify-end gap-1 mt-0.5"
                style={{ color: 'var(--textMuted)' }}
              >
                <SafetyCertificateOutlined />
                {t('pricing.checkout.selectProvider')}
              </div>
            </div>
          </div>

          <StripeProviderRow
            label={t('pricing.checkout.stripe')}
            sub={t('pricing.checkout.stripeHint')}
          />

          {/* Auto-renew checkbox is only relevant for monthly auto-renewable
              prices (Stripe Subscription mode). */}
          {selectedPrice?.supportsAutoRenew && selectedPrice.months === 1 && (
            <Checkbox
              checked={enableAutoRenew}
              onChange={(e) => setEnableAutoRenew(e.target.checked)}
            >
              {t('pricing.checkout.stripeAutoRenew', t('pricing.checkout.autoRenew'))}
            </Checkbox>
          )}

          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={doCreateOrder}
            disabled={!isLoggedIn}
            style={{ fontWeight: 600 }}
          >
            {t('pricing.checkout.redirectToPay')}
          </Button>
        </Space>
      </Modal>
    </div>
  );
}

function StripeProviderRow({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="rounded-xl p-3 w-full"
      style={{
        background: 'rgba(37, 99, 235, 0.12)',
        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.14)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm" style={{ color: '#2563eb' }}>
            {label}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--textMuted)' }}>
            {sub}
          </div>
        </div>
        <div
          style={{
            color: '#2563eb',
            fontSize: 22,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CreditCardOutlined />
        </div>
      </div>
    </div>
  );
}
