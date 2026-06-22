import { useEffect, useMemo, useState } from 'react';
import {
  Typography, Button, Modal, Segmented, Space, message, Checkbox, Skeleton, Alert,
} from 'antd';
import {
  CheckOutlined, SafetyCertificateOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useGeoStore } from '../stores/geo';
import UpgradeDifferenceCard from '../components/UpgradeDifferenceCard';
import type { CatalogProduct, CatalogPrice, Plan, TrialPublicConfig, TrialStatus, PaymentsPublicConfig } from '../types';

const { Title, Paragraph } = Typography;

type BillingCycle = 'monthly' | 'yearly';
type Currency = 'CNY' | 'USD' | 'EUR';

const FREE_CARD_KEY = 'free';
const SUPPORTED_CURRENCIES: Currency[] = ['CNY', 'USD', 'EUR'];

// Maps an ISO currency code to its display symbol. Falls back to the code
// itself with a trailing space (e.g. "GBP 12.34") so unknown currencies stay
// readable instead of silently appearing as bare numbers.
const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };

// Pick the currency a user most likely wants based on their UI locale. The
// user can still override via the currency selector. Falls back to CNY for
// any locale not explicitly mapped.
function defaultCurrencyForLocale(lang: string | undefined): Currency {
  const code = (lang || '').toLowerCase().slice(0, 2);
  if (code === 'en') return 'USD';
  if (code === 'fr') return 'EUR';
  return 'CNY';
}

function formatPrice(cents: number, currency: string | null | undefined): string {
  const sym = currency ? (CURRENCY_SYMBOL[currency] ?? `${currency} `) : '¥';
  const v = (cents / 100).toFixed(2).replace(/\.00$/, '');
  return `${sym}${v}`;
}

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  // Free-country visitors (admin-configured, default mainland China) keep
  // access to this page but don't see the paid tiers — only the Free card and
  // a "coming soon" notice. Gate on geoLoaded too so paid tiers never flash.
  const geoLoaded = useGeoStore((s) => s.loaded);
  const hidePaid = useGeoStore((s) => s.freeCountry);

  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [trialPublic, setTrialPublic] = useState<TrialPublicConfig | null>(null);
  const [paymentsPublic, setPaymentsPublic] = useState<PaymentsPublicConfig | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [adaptivePricing, setAdaptivePricing] = useState(false);
  const [embeddedCheckout, setEmbeddedCheckout] = useState(false);
  const [anchorCurrency, setAnchorCurrency] = useState<Currency>('EUR');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [currency, setCurrency] = useState<Currency>(() =>
    defaultCurrencyForLocale(i18n.language)
  );
  const [userSelectedCurrency, setUserSelectedCurrency] = useState(false);
  const displayCurrency: Currency = adaptivePricing ? anchorCurrency : currency;

  const [open, setOpen] = useState(false);
  const [buyingProduct, setBuyingProduct] = useState<CatalogProduct | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<CatalogPrice | null>(null);
  const [enableAutoRenew, setEnableAutoRenew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);

  const isLoggedIn = !!user;
  const trialDays = trialPublic?.days ?? trialStatus?.days;
  const trialPlanCode = trialPublic?.plan ?? trialStatus?.plan;
  const trialPlanLabel = trialPlanCode ? t(`plan.${trialPlanCode}`) : '';
  const trialCopy = { days: trialDays ?? 0, plan: trialPlanLabel };
  const trialConfigReady = trialPublic != null || trialStatus != null;
  const showTrialFeature = trialConfigReady
    && Boolean(trialPublic?.enabled ?? trialStatus?.enabled)
    && trialDays != null;
  const trialEligible = Boolean(trialStatus?.eligible);
  const trialActive = Boolean(trialStatus?.active);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/pay/products');
        if (!cancelled) {
          setProducts(data.products || []);
          if (data.trial) setTrialPublic(data.trial);
          setPaymentsPublic({
            paymentsEnabled: data.paymentsEnabled !== false,
            paymentsDisabledMessage: data.paymentsDisabledMessage,
          });
          if (data.adaptivePricing) {
            setAdaptivePricing(true);
            const anchor = data.anchorCurrency;
            if (anchor === 'CNY' || anchor === 'USD' || anchor === 'EUR') {
              setAnchorCurrency(anchor);
              setCurrency(anchor);
            }
          }
          if (data.checkoutMode === 'embedded') {
            setEmbeddedCheckout(true);
          }
        }
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setTrialStatus(null);
      return;
    }
    if (user?.trial) {
      setTrialStatus(user.trial);
      return;
    }
    let cancelled = false;
    api.get('/user/trial/status')
      .then((r) => { if (!cancelled) setTrialStatus(r.data.trial); })
      .catch(() => { if (!cancelled) setTrialStatus(null); });
    return () => { cancelled = true; };
  }, [isLoggedIn, user?.trial, user?.id]);

  async function startFreeTrial() {
    if (!isLoggedIn) {
      message.info(t('pricing.checkout.loginFirst'));
      navigate('/register');
      return;
    }
    setTrialLoading(true);
    try {
      const { data } = await api.post('/user/trial/start');
      if (data?.trial) setTrialStatus(data.trial);
      await fetchMe();
      message.success(t('pricing.trial.startSuccess', {
        days: data?.trial?.days ?? trialDays ?? 0,
        plan: data?.trial?.plan ? t(`plan.${data.trial.plan}`) : trialPlanLabel,
      }));
      navigate('/practice');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string } } };
      const code = err.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        message.warning(t('pricing.trial.verifyEmailFirst'));
      } else {
        message.error(err.response?.data?.error || t('pricing.trial.startFailed'));
      }
    } finally {
      setTrialLoading(false);
    }
  }

  // Pull the IP-derived currency from the edge proxy header. Doesn't block
  // the catalog render; if it fails or the user already picked, we leave
  // the locale-based default alone.
  useEffect(() => {
    if (adaptivePricing || userSelectedCurrency) return;
    let cancelled = false;
    api.get('/pay/preferred-currency')
      .then((r) => {
        if (cancelled || userSelectedCurrency) return;
        const cur = r.data?.currency;
        if (cur === 'CNY' || cur === 'USD' || cur === 'EUR') {
          setCurrency(cur);
        }
      })
      .catch(() => { /* fall back to locale-based default */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptivePricing]);

  // Find the Price matching BOTH the requested cycle and the selected
  // currency. Returns null when the product has no row for that combo —
  // the cards then show "—" / disable the buy button gracefully instead
  // of falling through to a row in a different currency.
  function priceForCycle(product: CatalogProduct, c: BillingCycle): CatalogPrice | null {
    const months = c === 'monthly' ? 1 : 12;
    const matches = product.prices.filter(
      (p) => p.months === months && p.currency === displayCurrency,
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.code.localeCompare(b.code));
    return matches[0];
  }

  const paymentsEnabled = paymentsPublic?.paymentsEnabled !== false;

  function paymentsDisabledText(): string {
    const lang = (i18n.language || 'zh').split('-')[0] as 'zh' | 'en' | 'fr';
    const msg = paymentsPublic?.paymentsDisabledMessage;
    return msg?.[lang] || msg?.zh || t('pricing.paymentsDisabled.default');
  }

  function openCheckout(product: CatalogProduct) {
    if (!paymentsEnabled) {
      Modal.info({
        title: t('pricing.paymentsDisabled.title'),
        content: paymentsDisabledText(),
        okText: t('pricing.paymentsDisabled.ok'),
      });
      return;
    }
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
    if (!paymentsEnabled) {
      Modal.info({
        title: t('pricing.paymentsDisabled.title'),
        content: paymentsDisabledText(),
        okText: t('pricing.paymentsDisabled.ok'),
      });
      return;
    }
    setLoading(true);
    try {
      const subscribe = enableAutoRenew && !!selectedPrice.supportsAutoRenew && selectedPrice.months === 1;
      const { data } = await api.post('/pay/stripe/checkout', {
        priceId: selectedPrice.id,
        subscribe,
      });
      if (data?.checkoutMode === 'embedded' && data?.clientSecret) {
        setOpen(false);
        navigate('/checkout/stripe', {
          state: {
            clientSecret: data.clientSecret,
            orderId: data.orderId,
            sessionId: data.sessionId,
          },
        });
        return;
      }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      message.error(t('pricing.checkout.createFailed'));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string; messages?: Record<string, string> } } };
      if (err.response?.data?.code === 'PAYMENTS_DISABLED') {
        const lang = (i18n.language || 'zh').split('-')[0] as 'zh' | 'en' | 'fr';
        const msgs = err.response.data.messages;
        message.info(msgs?.[lang] || err.response.data.error || paymentsDisabledText());
      } else {
        message.error(err.response?.data?.error || t('pricing.checkout.createFailed'));
      }
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

  // CN visitors only see the Free card; everyone else sees all tiers.
  const visibleCards = hidePaid ? cards.filter((c) => c.key === FREE_CARD_KEY) : cards;

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

      {(!paymentsEnabled || showTrialFeature) && (
        <div className="max-w-3xl mx-auto mb-8 space-y-4">
          {!paymentsEnabled && (
            <Alert
              type="warning"
              showIcon
              message={t('pricing.paymentsDisabled.banner')}
              description={paymentsDisabledText()}
            />
          )}

          {showTrialFeature && (
            trialActive ? (
              <Alert
                type="success"
                showIcon
                message={t('pricing.trial.activeBanner', {
                  days: trialStatus?.daysLeft ?? trialDays ?? 0,
                  plan: trialPlanLabel,
                })}
                action={(
                  <Space>
                    <Button size="small" onClick={() => navigate('/practice')}>
                      {t('pricing.trial.goPractice')}
                    </Button>
                  </Space>
                )}
              />
            ) : (
              <Alert
                type="info"
                showIcon
                message={t('pricing.trial.promoBanner', trialCopy)}
                description={
                  !isLoggedIn
                    ? t('pricing.trial.registerHint', trialCopy)
                    : trialEligible
                      ? t('pricing.trial.eligibleHint', trialCopy)
                      : t('pricing.trial.usedHint')
                }
                action={
                  trialEligible ? (
                    <Button type="primary" size="small" loading={trialLoading} onClick={startFreeTrial}>
                      {t('pricing.trial.startButton', trialCopy)}
                    </Button>
                  ) : !isLoggedIn ? (
                    <Link to="/register">
                      <Button type="primary" size="small">{t('nav.register')}</Button>
                    </Link>
                  ) : undefined
                }
              />
            )
          )}
        </div>
      )}

      {hidePaid && (
        <Alert
          type="info"
          showIcon
          className="max-w-3xl mx-auto mb-10"
          message={t('pricing.paidComingSoon.title')}
          description={t('pricing.paidComingSoon.desc')}
        />
      )}

      {!hidePaid && <UpgradeDifferenceCard />}

      {!hidePaid && (
        <div className="flex justify-center mb-10 gap-3 flex-wrap">
          <Segmented
            value={cycle}
            onChange={(v) => setCycle(v as BillingCycle)}
            size="large"
            options={[
              { label: t('pricing.checkout.monthly'), value: 'monthly' },
              { label: t('pricing.checkout.yearly'), value: 'yearly' },
            ]}
          />
          {!catalogLoading && !adaptivePricing && (
            <Segmented
              value={currency}
              onChange={(v) => {
                setCurrency(v as Currency);
                setUserSelectedCurrency(true);
              }}
              size="large"
              options={SUPPORTED_CURRENCIES.map((cur) => ({
                label: `${CURRENCY_SYMBOL[cur]} ${cur}`,
                value: cur,
              }))}
            />
          )}
        </div>
      )}

      {!hidePaid && adaptivePricing && (
        <Paragraph className="text-center mb-8" style={{ color: 'var(--textMuted)' }}>
          {embeddedCheckout
            ? t('pricing.embeddedPricingNote', { currency: anchorCurrency })
            : t('pricing.adaptivePricingNote', { currency: anchorCurrency })}
        </Paragraph>
      )}

      {catalogLoading || !geoLoaded ? (
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
        <div
          className={
            hidePaid
              ? 'max-w-md mx-auto'
              : 'grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-stretch'
          }
        >
          {visibleCards.map((c) => {
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
                  <Space direction="vertical" className="w-full" size="small">
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
                        {showTrialFeature
                          ? t('pricing.trial.registerCta', trialCopy)
                          : t('pricing.plans.free.cta')}
                      </Button>
                    </Link>
                  </Space>
                ) : (
                  <Space direction="vertical" className="w-full" size="small">
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
                    {showTrialFeature && trialEligible && !trialActive && (
                      <Button
                        block
                        size="large"
                        loading={trialLoading}
                        onClick={startFreeTrial}
                      >
                        {t('pricing.trial.startButton', trialCopy)}
                      </Button>
                    )}
                  </Space>
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
        {t(adaptivePricing ? 'pricing.adaptivePaymentNote' : 'pricing.paymentNote')}
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
            sub={embeddedCheckout
              ? t('pricing.checkout.stripeEmbeddedHint')
              : t('pricing.checkout.stripeHint')}
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

          {trialEligible && !trialActive && (
            <div className="text-center text-sm" style={{ color: 'var(--textMuted)' }}>
              {t('pricing.trial.modalHint', trialCopy)}
              {' '}
              <Button type="link" size="small" loading={trialLoading} onClick={startFreeTrial} style={{ padding: 0 }}>
                {t('pricing.trial.startButton', trialCopy)}
              </Button>
            </div>
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
            {embeddedCheckout
              ? t('pricing.checkout.continueToCheckout')
              : t('pricing.checkout.redirectToPay')}
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
