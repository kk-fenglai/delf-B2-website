import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Typography, Button, Modal, Segmented, QRCode,
  Space, message, Checkbox, Skeleton,
} from 'antd';
import {
  CheckOutlined, WechatOutlined, AlipayOutlined, SafetyCertificateOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import type { CatalogProduct, CatalogPrice, CreatedOrderResponse, Plan } from '../types';

const { Title, Paragraph } = Typography;

type BillingCycle = 'monthly' | 'yearly';
type Provider = 'wechat' | 'alipay' | 'stripe';
type PayRegion = 'domestic' | 'overseas';

const FREE_CARD_KEY = 'free';

/** WeChat brand green (official-style) */
const WECHAT_GREEN = '#07C160';

function formatYuan(cents: number) {
  if (cents % 100 === 0) return `¥${cents / 100}`;
  return `¥${(cents / 100).toFixed(2)}`;
}

export default function Pricing() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const [open, setOpen] = useState(false);
  const [buyingProduct, setBuyingProduct] = useState<CatalogProduct | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<CatalogPrice | null>(null);
  const [region, setRegion] = useState<PayRegion>('domestic');
  const [provider, setProvider] = useState<Provider>('wechat');
  const [enableAutoRenew, setEnableAutoRenew] = useState(false);

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<CreatedOrderResponse | null>(null);
  const [polling, setPolling] = useState(false);

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
    setRegion('domestic');
    setProvider('wechat');
    setEnableAutoRenew(false);
    setOrder(null);
    setOpen(true);
  }

  function switchRegion(next: PayRegion) {
    setRegion(next);
    setEnableAutoRenew(false);
    setOrder(null);
    setPolling(false);
    setProvider(next === 'overseas' ? 'stripe' : 'wechat');
  }

  function chooseProvider(p: Provider) {
    setProvider(p);
    setEnableAutoRenew(false);
    setOrder(null);
    setPolling(false);
  }

  const priceLabel = selectedPrice ? formatYuan(selectedPrice.amountCents) : '—';
  const periodLabel = selectedPrice
    ? (selectedPrice.months === 1 ? t('pricing.checkout.perMonth') : t('pricing.checkout.perYear'))
    : '';

  async function doCreateOrder() {
    if (!selectedPrice) return;
    setLoading(true);
    try {
      if (provider === 'stripe') {
        const { data } = await api.post('/pay/stripe/checkout', { priceId: selectedPrice.id });
        if (data?.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        message.error(t('pricing.checkout.createFailed'));
        return;
      }
      if (enableAutoRenew && selectedPrice.supportsAutoRenew) {
        const path = provider === 'wechat' ? '/pay/wechat/sign' : '/pay/alipay/sign';
        const { data } = await api.post(path, { priceId: selectedPrice.id });
        if (data.redirectUrl) {
          window.open(data.redirectUrl, '_blank', 'noopener,noreferrer');
          message.success(t('pricing.checkout.openingAlipay'));
        } else {
          message.error(t('pricing.checkout.createFailed'));
        }
        return;
      }
      const path = provider === 'wechat' ? '/pay/wechat/native' : '/pay/alipay/create';
      const body: Record<string, unknown> = { priceId: selectedPrice.id };
      if (provider === 'alipay') body.product = 'precreate_qr';
      const { data } = await api.post(path, body);
      setOrder({ ...data, provider });
      setPolling(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || t('pricing.checkout.createFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function mockPay() {
    if (!order) return;
    try {
      await api.post(`/pay/orders/${order.orderId}/mock-pay`);
      message.success(t('pricing.checkout.mockSuccess'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(msg || 'Mock pay failed');
    }
  }

  useEffect(() => {
    if (!open || !order?.orderId || !polling) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/pay/orders/${order.orderId}`);
        const status = String(data?.order?.status || '');
        if (cancelled) return;
        if (status === 'PAID') {
          setPolling(false);
          message.success(t('pricing.checkout.paySuccess'));
          await fetchMe();
          setOpen(false);
        }
        if (status === 'CLOSED' || status === 'FAILED') {
          setPolling(false);
          message.error(t('pricing.checkout.payClosed'));
        }
      } catch {
        // ignore transient polling errors
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, order?.orderId, polling, fetchMe, t]);

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
              : price ? formatYuan(price.amountCents) : '—';
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
        onCancel={() => { setPolling(false); setOpen(false); }}
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

          <Segmented
            block
            value={region}
            onChange={(v) => switchRegion(v as PayRegion)}
            options={[
              { label: t('pricing.checkout.domestic'), value: 'domestic' },
              { label: t('pricing.checkout.overseas'), value: 'overseas' },
            ]}
          />

          {region === 'domestic' ? (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div className="text-xs" style={{ color: 'var(--textMuted)' }}>
                {t('pricing.checkout.domesticHint')}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <ProviderOption
                  label={t('pricing.checkout.wechat')}
                  sub={t('pricing.checkout.scanPay')}
                  icon={<WechatOutlined />}
                  iconColor={WECHAT_GREEN}
                  selected={provider === 'wechat'}
                  onClick={() => chooseProvider('wechat')}
                />
                <ProviderOption
                  label={t('pricing.checkout.alipay')}
                  sub={t('pricing.checkout.scanPay')}
                  icon={<AlipayOutlined />}
                  selected={provider === 'alipay'}
                  onClick={() => chooseProvider('alipay')}
                />
              </div>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div className="text-xs" style={{ color: 'var(--textMuted)' }}>
                {t('pricing.checkout.overseasHint')}
              </div>
              <ProviderOption
                label={t('pricing.checkout.stripe')}
                sub={t('pricing.checkout.stripeHint')}
                icon={<CreditCardOutlined />}
                selected={provider === 'stripe'}
                onClick={() => chooseProvider('stripe')}
              />
            </Space>
          )}

          {region === 'domestic' && provider !== 'stripe' && selectedPrice?.supportsAutoRenew && (
            <Checkbox
              checked={enableAutoRenew}
              onChange={(e) => setEnableAutoRenew(e.target.checked)}
            >
              {t('pricing.checkout.autoRenew')}
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
            {enableAutoRenew
              ? t('pricing.checkout.autoRenew')
              : region === 'overseas' || provider === 'stripe'
                ? t('pricing.checkout.redirectToPay')
                : t('pricing.checkout.generateQr')}
          </Button>

          {order?.codeUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div
                className="p-4 rounded-xl"
                style={{ background: '#ffffff', boxShadow: '0 6px 18px rgba(15,23,42,0.06)' }}
              >
                <QRCode value={order.codeUrl} />
              </div>
              <div className="text-xs" style={{ color: 'var(--textMuted)' }}>
                {t('pricing.checkout.orderId', { id: order.orderId })}
              </div>
              <div className="text-xs" style={{ color: 'var(--textMuted)' }}>
                {t('pricing.checkout.qrExpires')}
              </div>
              {order.mock && (
                <Button onClick={mockPay}>
                  {t('pricing.checkout.mockPay')}
                </Button>
              )}
            </div>
          ) : order?.redirectUrl ? (
            <div className="text-sm">
              <a href={order.redirectUrl} target="_blank" rel="noreferrer">
                {provider === 'stripe'
                  ? t('pricing.checkout.stripe')
                  : t('pricing.checkout.alipay')}
              </a>
            </div>
          ) : null}
        </Space>
      </Modal>
    </div>
  );
}

function ProviderOption({ label, sub, icon, iconColor, selected, onClick }: {
  label: string;
  sub: string;
  icon: ReactNode;
  /** When set, icon uses this color in both selected / unselected states (e.g. WeChat green). */
  iconColor?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl p-3 text-left w-full transition-all"
      style={{
        background: selected ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.04)',
        boxShadow: selected ? '0 4px 14px rgba(37, 99, 235, 0.14)' : 'none',
        border: 'none',
        outline: 'none',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div
            className="font-medium text-sm"
            style={{ color: selected ? '#2563eb' : 'var(--text)' }}
          >
            {label}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--textMuted)' }}>
            {sub}
          </div>
        </div>
        <div
          style={{
            color: iconColor ?? (selected ? '#2563eb' : 'var(--textMuted)'),
            fontSize: 22,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {icon}
        </div>
      </div>
    </button>
  );
}
