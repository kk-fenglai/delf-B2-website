import { useEffect, useMemo, useState } from 'react';
import {
  Card, Col, Row, Typography, Button, Tag, List, Modal, Segmented, QRCode,
  Space, message, Checkbox, Skeleton,
} from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import type { CatalogProduct, CatalogPrice, CreatedOrderResponse, Plan } from '../types';

const { Title, Paragraph } = Typography;

type BillingCycle = 'monthly' | 'yearly';
type Provider = 'wechat' | 'alipay';

// Free card is presentational only; paid plans come from /pay/products.
const FREE_CARD_KEY = 'free';

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

  // Find the catalog price matching the selected cycle (months: 1 for monthly, 12 for yearly).
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
    setProvider('wechat');
    setEnableAutoRenew(false);
    setOrder(null);
    setOpen(true);
  }

  async function doCreateOrder() {
    if (!selectedPrice) return;
    setLoading(true);
    try {
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
        // ignore transient network errors during polling
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, order?.orderId, polling, fetchMe, t]);

  // Merge free (i18n-only) + paid (catalog) for display. Paid cards look up
  // i18n translations by product.plan in lowercase (e.g. STANDARD → "standard").
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
      <div className="text-center mb-6">
        <Title level={2}>{t('pricing.title')}</Title>
        <Paragraph className="text-gray-500">{t('pricing.subtitle')}</Paragraph>
      </div>

      <div className="flex justify-center mb-6">
        <Segmented
          value={cycle}
          onChange={(v) => setCycle(v as BillingCycle)}
          options={[
            { label: t('pricing.checkout.monthly'), value: 'monthly' },
            { label: t('pricing.checkout.yearly'), value: 'yearly' },
          ]}
        />
      </div>

      {catalogLoading ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2, 3].map((i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card><Skeleton active /></Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          {cards.map((c) => {
            const isFree = c.key === FREE_CARD_KEY;
            const highlight = c.key === 'ai';
            const price = c.product ? priceForCycle(c.product, cycle) : null;
            const features = featuresFor(c.key);
            const name = t(`pricing.plans.${c.key}.name`, c.product?.name || '');

            return (
              <Col xs={24} sm={12} lg={6} key={c.key}>
                <Card
                  className="h-full"
                  style={highlight ? { border: '2px solid #1A3A5C' } : {}}
                  title={
                    <div className="flex items-center gap-2">
                      {name}
                      {highlight && <Tag color="gold">{t('pricing.popular')}</Tag>}
                    </div>
                  }
                >
                  <div className="mb-4">
                    {isFree ? (
                      <>
                        <span className="text-3xl font-bold text-brand">
                          {t('pricing.plans.free.price')}
                        </span>
                        <span className="text-gray-500 ml-1">
                          {t('pricing.plans.free.period')}
                        </span>
                      </>
                    ) : price ? (
                      <>
                        <span className="text-3xl font-bold text-brand">
                          {formatYuan(price.amountCents)}
                        </span>
                        <span className="text-gray-500 ml-1">
                          {cycle === 'monthly'
                            ? t('pricing.checkout.perMonth')
                            : t('pricing.checkout.perYear')}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                  <List
                    size="small"
                    dataSource={features}
                    renderItem={(f) => (
                      <List.Item className="!px-0">
                        <CheckOutlined className="text-green-500 mr-2" />
                        {f}
                      </List.Item>
                    )}
                  />
                  {isFree ? (
                    <Link to="/register">
                      <Button block className="mt-4">
                        {t('pricing.plans.free.cta')}
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      type={highlight ? 'primary' : 'default'}
                      block
                      className="mt-4"
                      disabled={!price}
                      onClick={() => c.product && openCheckout(c.product)}
                    >
                      {t('pricing.checkout.buyNow')}
                    </Button>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <div className="text-center mt-8 text-gray-500 text-sm">
        {t('pricing.paymentNote')}
      </div>

      <Modal
        title={t('pricing.checkout.title')}
        open={open}
        onCancel={() => { setPolling(false); setOpen(false); }}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div className="text-sm text-gray-600">
            {buyingProduct?.name} ·{' '}
            {selectedPrice && (
              <>
                {selectedPrice.months === 1
                  ? t('pricing.checkout.perMonth')
                  : t('pricing.checkout.perYear')}
                {' · '}
                <strong>{formatYuan(selectedPrice.amountCents)}</strong>
              </>
            )}
          </div>

          <Segmented
            value={provider}
            onChange={(v) => setProvider(v as Provider)}
            options={[
              { label: t('pricing.checkout.wechat'), value: 'wechat' },
              { label: t('pricing.checkout.alipay'), value: 'alipay' },
            ]}
          />

          {selectedPrice?.supportsAutoRenew && (
            <Checkbox
              checked={enableAutoRenew}
              onChange={(e) => setEnableAutoRenew(e.target.checked)}
            >
              {t('pricing.checkout.autoRenew')}
            </Checkbox>
          )}

          <Button type="primary" loading={loading} onClick={doCreateOrder} disabled={!isLoggedIn}>
            {enableAutoRenew
              ? t('pricing.checkout.autoRenew')
              : t('pricing.checkout.generateQr')}
          </Button>

          {order?.codeUrl ? (
            <div className="flex flex-col items-center gap-3">
              <QRCode value={order.codeUrl} />
              <div className="text-xs text-gray-500">
                {t('pricing.checkout.orderId', { id: order.orderId })}
              </div>
              <div className="text-xs text-gray-400">
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
                {t('pricing.checkout.alipay')}
              </a>
            </div>
          ) : null}
        </Space>
      </Modal>
    </div>
  );
}
