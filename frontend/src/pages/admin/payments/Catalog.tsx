import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Button, Space, Table, Tag, Popconfirm, Alert, Empty, message, Spin, Tooltip, Switch,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, EditOutlined, StopOutlined, ReloadOutlined, UndoOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';
import {
  CopyButton, formatMoney, type PriceRow, type ProductRow,
} from './_shared';
import ProductFormDrawer from './ProductFormDrawer';
import PriceFormDrawer from './PriceFormDrawer';
import BillingPolicyCard from './BillingPolicyCard';

export interface BillingConfig {
  adaptivePricing: boolean;
  anchorCurrency: string;
  checkoutMode: 'embedded' | 'hosted';
}

interface TrialConfig {
  enabled: boolean;
  days: number;
  plan: string;
}

export default function Catalog() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  const [trialConfig, setTrialConfig] = useState<TrialConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Hidden by default — disabled rows are kept in the DB so historical orders
  // can still resolve their `priceId`, but admins almost never want to look at
  // them. Toggle reveals them so they can be re-enabled or audited.
  const [showDisabled, setShowDisabled] = useState(false);

  const [productDrawer, setProductDrawer] = useState<{ open: boolean; editing: ProductRow | null }>(
    { open: false, editing: null },
  );
  const [priceDrawer, setPriceDrawer] = useState<{
    open: boolean; productId: string | null; editing: PriceRow | null;
  }>({ open: false, productId: null, editing: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, trialRes] = await Promise.all([
        adminApi.get('/products'),
        adminApi.get('/trial-config').catch(() => ({ data: null })),
      ]);
      setProducts(productsRes.data.products || []);
      setBilling(productsRes.data.billing || null);
      setTrialConfig(trialRes.data || null);
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalDisabledPrices = useMemo(
    () => products.reduce((acc, p) => acc + p.prices.filter((x) => !x.active).length, 0),
    [products],
  );

  async function disableProduct(p: ProductRow) {
    setBusyId(p.id);
    try {
      await adminApi.delete(`/products/${p.id}`);
      message.success(t('adminPayments.common.saved'));
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function disablePrice(price: PriceRow) {
    setBusyId(price.id);
    try {
      await adminApi.delete(`/prices/${price.id}`);
      message.success(t('adminPayments.common.saved'));
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function reactivatePrice(price: PriceRow) {
    setBusyId(price.id);
    try {
      await adminApi.patch(`/prices/${price.id}`, { active: true });
      message.success(t('adminPayments.catalog.reactivated'));
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(p: ProductRow) {
    setBusyId(p.id);
    try {
      await adminApi.delete(`/products/${p.id}`, { params: { hard: true } });
      message.success(t('adminPayments.catalog.deleted'));
      await load();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'PRODUCT_IN_USE') {
        message.error(t('adminPayments.catalog.deleteInUse'));
      } else {
        message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deletePrice(price: PriceRow) {
    setBusyId(price.id);
    try {
      await adminApi.delete(`/prices/${price.id}`, { params: { hard: true } });
      message.success(t('adminPayments.catalog.deleted'));
      await load();
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'PRICE_IN_USE') {
        message.error(t('adminPayments.catalog.deleteInUse'));
      } else {
        message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Spin spinning={loading && products.length === 0}>
      <div className="admin-page-header">
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setProductDrawer({ open: true, editing: null })}
          >
            {t('adminPayments.catalog.newProduct')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            {t('adminPayments.common.refresh')}
          </Button>
        </Space>
        <Space>
          <span style={{ color: '#666', fontSize: 13 }}>
            {totalDisabledPrices > 0
              ? t('adminPayments.catalog.showDisabledCount', { count: totalDisabledPrices })
              : t('adminPayments.catalog.showDisabled')}
          </span>
          <Switch checked={showDisabled} onChange={setShowDisabled} />
        </Space>
      </div>

      <BillingPolicyCard />

      {billing?.adaptivePricing && billing.checkoutMode === 'embedded' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('adminPayments.catalog.billingBannerEmbedded', {
            currency: billing.anchorCurrency,
          })}
          description={t('adminPayments.catalog.eurOnlyHint', {
            currency: billing.anchorCurrency,
          })}
        />
      )}

      {trialConfig?.enabled && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('adminPayments.catalog.trialBanner', {
            days: trialConfig.days,
            plan: trialConfig.plan,
          })}
        />
      )}

      {products.length === 0 && !loading ? (
        <Empty description={t('adminPayments.common.empty')} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              billing={billing}
              busyId={busyId}
              showDisabled={showDisabled}
              onEditProduct={() => setProductDrawer({ open: true, editing: product })}
              onDisableProduct={() => disableProduct(product)}
              onCreatePrice={() =>
                setPriceDrawer({ open: true, productId: product.id, editing: null })
              }
              onEditPrice={(price) =>
                setPriceDrawer({ open: true, productId: product.id, editing: price })
              }
              onDisablePrice={(price) => disablePrice(price)}
              onReactivatePrice={(price) => reactivatePrice(price)}
              onDeleteProduct={() => deleteProduct(product)}
              onDeletePrice={(price) => deletePrice(price)}
            />
          ))}
        </Space>
      )}

      <ProductFormDrawer
        open={productDrawer.open}
        editing={productDrawer.editing}
        onClose={() => setProductDrawer({ open: false, editing: null })}
        onSaved={load}
      />
      <PriceFormDrawer
        open={priceDrawer.open}
        productId={priceDrawer.productId}
        editing={priceDrawer.editing}
        billing={billing}
        onClose={() => setPriceDrawer({ open: false, productId: null, editing: null })}
        onSaved={load}
      />
    </Spin>
  );
}

interface CardProps {
  product: ProductRow;
  billing: BillingConfig | null;
  busyId: string | null;
  showDisabled: boolean;
  onEditProduct: () => void;
  onDisableProduct: () => void;
  onCreatePrice: () => void;
  onEditPrice: (p: PriceRow) => void;
  onDisablePrice: (p: PriceRow) => void;
  onReactivatePrice: (p: PriceRow) => void;
  onDeleteProduct: () => void;
  onDeletePrice: (p: PriceRow) => void;
}

function ProductCard({
  product,
  billing,
  busyId,
  showDisabled,
  onEditProduct,
  onDisableProduct,
  onCreatePrice,
  onEditPrice,
  onDisablePrice,
  onReactivatePrice,
  onDeleteProduct,
  onDeletePrice,
}: CardProps) {
  const { t } = useTranslation();

  const visiblePrices = useMemo(
    () => (showDisabled ? product.prices : product.prices.filter((p) => p.active)),
    [product.prices, showDisabled],
  );

  const anchorCurrency = (billing?.anchorCurrency || 'EUR').toUpperCase();
  const eurAnchorMode = Boolean(billing?.adaptivePricing && billing.checkoutMode === 'embedded');

  const missingStripeIdCount = product.prices.filter((p) => {
    if (!p.active || !p.supportsAutoRenew) return false;
    if (eurAnchorMode && (p.currency || '').toUpperCase() !== anchorCurrency) return false;
    const currency = (p.currency || anchorCurrency).toUpperCase();
    const mapped = (p.stripeMappings || []).some((m) => m.currency.toUpperCase() === currency && !!m.stripePriceId);
    return !mapped && !p.stripePriceId;
  }).length;

  const columns: ColumnsType<PriceRow> = [
    {
      title: t('adminPayments.catalog.priceCol.currency'),
      dataIndex: 'currency',
      width: 80,
      render: (v: string, row) => {
        const cur = (v || '—').toUpperCase();
        const isAnchor = eurAnchorMode && cur === anchorCurrency;
        return isAnchor ? <Tag color="blue">{cur}</Tag> : <span style={{ color: row.active ? undefined : '#bbb' }}>{cur}</span>;
      },
    },
    {
      title: t('adminPayments.catalog.priceCol.code'),
      dataIndex: 'code',
      width: 160,
      render: (v: string, row) => (
        <code
          style={{
            fontSize: 12,
            color: row.active ? undefined : '#bbb',
            textDecoration: row.active ? undefined : 'line-through',
          }}
        >
          {v}
        </code>
      ),
    },
    {
      title: t('adminPayments.catalog.priceCol.displayName'),
      width: 180,
      render: (_v, row) =>
        row.name ? (
          <span style={{ color: row.active ? undefined : '#bbb' }}>{row.name}</span>
        ) : (
          <span style={{ color: '#bbb' }}>—</span>
        ),
    },
    {
      title: t('adminPayments.catalog.priceCol.months'),
      dataIndex: 'months',
      width: 100,
      render: (n: number) => t('adminPayments.catalog.monthsUnit', { n }),
    },
    {
      title: t('adminPayments.catalog.priceCol.amount'),
      width: 160,
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: row.active ? undefined : '#bbb' }}>
          {formatMoney(row.amountCents, row.currency)}
          {row.months === 1 && row.supportsAutoRenew && (
            <span style={{ color: '#999', fontSize: 12 }}>
              {t('adminPayments.catalog.perMonth')}
            </span>
          )}
        </span>
      ),
    },
    {
      title: t('adminPayments.catalog.priceCol.autoRenew'),
      dataIndex: 'supportsAutoRenew',
      width: 110,
      render: (v: boolean) =>
        v ? <Tag color="blue">{t('adminPayments.common.yes')}</Tag> : <Tag>{t('adminPayments.common.no')}</Tag>,
    },
    {
      title: t('adminPayments.catalog.priceCol.stripePriceId'),
      width: 240,
      render: (_v, row) => {
        const currency = (row.currency || 'CNY').toUpperCase();
        const mapped = (row.stripeMappings || []).find((m) => m.currency.toUpperCase() === currency);
        const shown = mapped?.stripePriceId || row.stripePriceId;
        if (shown) {
          return (
            <Space size={4}>
              <code style={{ fontSize: 12 }}>{shown}</code>
              <CopyButton text={shown} />
            </Space>
          );
        }
        if (row.supportsAutoRenew && row.active) {
          return <Tag color="warning">{t('adminPayments.catalog.noStripeId')}</Tag>;
        }
        return <span style={{ color: '#bbb' }}>—</span>;
      },
    },
    {
      title: t('adminPayments.catalog.priceCol.active'),
      dataIndex: 'active',
      width: 90,
      render: (v: boolean) =>
        v ? (
          <Tag color="success">{t('adminPayments.common.active')}</Tag>
        ) : (
          <Tag>{t('adminPayments.common.inactive')}</Tag>
        ),
    },
    {
      title: t('adminPayments.catalog.priceCol.actions'),
      width: 140,
      fixed: 'right',
      render: (_v, row) => (
        <Space size={0}>
          <Tooltip title={t('adminPayments.catalog.tooltipEdit')}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditPrice(row)}
            />
          </Tooltip>
          {row.active ? (
            <Popconfirm
              title={t('adminPayments.catalog.confirmDisable')}
              onConfirm={() => onDisablePrice(row)}
            >
              <Tooltip title={t('adminPayments.catalog.tooltipDisable')}>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  loading={busyId === row.id}
                />
              </Tooltip>
            </Popconfirm>
          ) : (
            <>
              <Popconfirm
                title={t('adminPayments.catalog.confirmReactivate')}
                onConfirm={() => onReactivatePrice(row)}
              >
                <Tooltip title={t('adminPayments.catalog.tooltipReactivate')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<UndoOutlined style={{ color: '#52c41a' }} />}
                    loading={busyId === row.id}
                  />
                </Tooltip>
              </Popconfirm>
              <Popconfirm
                title={t('adminPayments.catalog.confirmDelete')}
                onConfirm={() => onDeletePrice(row)}
              >
                <Tooltip title={t('adminPayments.catalog.tooltipDelete')}>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={busyId === row.id}
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>{product.name}</span>
          <Tag>{product.code}</Tag>
          <Tag color="geekblue">{product.plan}</Tag>
          {!product.active && (
            <Tag color="default">{t('adminPayments.catalog.productDisabled')}</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={onEditProduct}>
            {t('adminPayments.common.edit')}
          </Button>
          <Popconfirm
            title={t('adminPayments.catalog.confirmDisable')}
            onConfirm={onDisableProduct}
            disabled={!product.active}
          >
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              loading={busyId === product.id}
              disabled={!product.active}
            >
              {t('adminPayments.common.disable')}
            </Button>
          </Popconfirm>
          {!product.active && (
            <Popconfirm
              title={t('adminPayments.catalog.confirmDeleteProduct')}
              onConfirm={onDeleteProduct}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={busyId === product.id}
              >
                {t('adminPayments.catalog.permanentDelete')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      }
    >
      {missingStripeIdCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('adminPayments.catalog.missingStripeAlert', { count: missingStripeIdCount })}
        />
      )}

      {visiblePrices.length === 0 ? (
        <Empty
          description={
            product.prices.length === 0
              ? t('adminPayments.catalog.noPrices')
              : t('adminPayments.catalog.noActivePrices')
          }
          style={{ padding: 24 }}
        />
      ) : (
        <Table
          rowKey="id"
          dataSource={visiblePrices}
          columns={columns}
          pagination={false}
          size="small"
          rowClassName={(row) => (row.active ? '' : 'opacity-60')}
        />
      )}

      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onCreatePrice}
          disabled={!product.active}
        >
          {t('adminPayments.catalog.newPrice')}
        </Button>
      </div>
    </Card>
  );
}
