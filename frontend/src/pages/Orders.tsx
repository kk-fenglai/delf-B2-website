import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Typography, Space, Button, Modal, QRCode, message, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type {
  PayProvider, OrderStatus, PaymentOrderSummary,
} from '../types';

const { Title } = Typography;

interface ContractRow {
  id: string;
  provider: PayProvider;
  status: 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'SUSPENDED';
  nextChargeAt: string | null;
  lastChargeAt: string | null;
  failedCount: number;
  signedAt: string | null;
  terminatedAt: string | null;
  price: {
    id: string;
    code: string;
    months: number;
    amountCents: number;
    currency: string;
    productName: string | null;
    plan: string | null;
  } | null;
}

interface OrderDetail {
  id: string;
  provider: PayProvider;
  product: string;
  plan: string;
  months: number;
  currency: string;
  amountCents: number;
  refundedCents: number;
  status: OrderStatus;
  codeUrl?: string | null;
  redirectUrl?: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const statusColor: Record<OrderStatus, string> = {
  CREATED: 'default',
  PENDING: 'processing',
  PAID: 'success',
  CLOSED: 'default',
  REFUNDED: 'warning',
  FAILED: 'error',
};

const contractStatusColor: Record<ContractRow['status'], string> = {
  PENDING: 'default',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'default',
};

function formatYuan(cents: number) {
  if (cents % 100 === 0) return `¥${cents / 100}`;
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function Orders() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<PaymentOrderSummary[] | null>(null);
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [resumeOrder, setResumeOrder] = useState<OrderDetail | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [unsignBusy, setUnsignBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [ordersRes, contractsRes] = await Promise.all([
      api.get('/pay/orders', { params: { page: 1, pageSize: 50 } }),
      api.get('/pay/contracts').catch(() => ({ data: { contracts: [] } })),
    ]);
    setOrders(ordersRes.data.orders || []);
    setContracts(contractsRes.data.contracts || []);
  }, []);

  useEffect(() => {
    reload().catch(() => {
      setOrders([]);
      setContracts([]);
    });
  }, [reload]);

  // If redirected back from Stripe success/cancel, resume polling the order.
  useEffect(() => {
    const resume = searchParams.get('resume');
    if (resume) {
      openResume(resume).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function unsignContract(c: ContractRow) {
    if (c.status === 'TERMINATED') return;
    Modal.confirm({
      title: t('orders.contracts.unsignConfirmTitle'),
      content: t('orders.contracts.unsignConfirmBody'),
      okText: t('orders.contracts.unsignConfirmOk'),
      cancelText: t('auth.common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setUnsignBusy(c.id);
        try {
          const path = c.provider === 'wechat' ? '/pay/wechat/unsign' : '/pay/alipay/unsign';
          await api.post(path, { contractId: c.id });
          message.success(t('orders.contracts.unsignSuccess'));
          await reload();
        } catch (e: any) {
          message.error(e?.response?.data?.error || t('orders.contracts.unsignFailed'));
        } finally {
          setUnsignBusy(null);
        }
      },
    });
  }

  async function openResume(orderId: string) {
    setBusy(orderId);
    try {
      const { data } = await api.get(`/pay/orders/${orderId}`);
      const o: OrderDetail = data.order;
      if (o.status !== 'PENDING' || !(o.codeUrl || o.redirectUrl)) {
        message.info(t('orders.status.' + o.status));
        await reload();
        return;
      }
      setResumeOrder(o);
      setPolling(true);
    } finally {
      setBusy(null);
    }
  }

  // Poll until PAID / CLOSED when resume modal is open.
  useEffect(() => {
    if (!resumeOrder || !polling) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/pay/orders/${resumeOrder.id}`);
        if (cancelled) return;
        const status = data?.order?.status as OrderStatus | undefined;
        if (status === 'PAID') {
          setPolling(false);
          message.success(t('pricing.checkout.paySuccess'));
          setResumeOrder(null);
          await reload();
        }
        if (status === 'CLOSED' || status === 'FAILED') {
          setPolling(false);
          message.error(t('pricing.checkout.payClosed'));
          setResumeOrder(null);
          await reload();
        }
      } catch {
        // transient — try again next tick
      }
    }, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [resumeOrder, polling, reload, t]);

  const columns = useMemo<ColumnsType<PaymentOrderSummary>>(() => [
    {
      title: t('orders.col.createdAt'),
      dataIndex: 'createdAt',
      render: (v: string) => formatDate(v),
      width: 180,
    },
    {
      title: t('orders.col.plan'),
      dataIndex: 'plan',
      render: (v: string) => <Tag>{t(`plan.${v}`, v)}</Tag>,
    },
    {
      title: t('orders.col.months'),
      dataIndex: 'months',
      render: (v: number) => t('orders.months', { count: v }),
    },
    {
      title: t('orders.col.amount'),
      dataIndex: 'amountCents',
      render: (_v: number, row) => {
        const base = formatYuan(row.amountCents);
        if (row.refundedCents > 0) {
          return (
            <span>
              {base}
              <span className="text-xs text-gray-500 ml-1">
                {t('orders.refundedSuffix', { amount: formatYuan(row.refundedCents) })}
              </span>
            </span>
          );
        }
        return base;
      },
    },
    {
      title: t('orders.col.provider'),
      dataIndex: 'provider',
      render: (v: PayProvider) => (v === 'wechat'
        ? t('pricing.checkout.wechat')
        : v === 'alipay'
          ? t('pricing.checkout.alipay')
          : t('pricing.checkout.stripe')),
    },
    {
      title: t('orders.col.status'),
      dataIndex: 'status',
      render: (v: OrderStatus) => <Tag color={statusColor[v]}>{t(`orders.status.${v}`)}</Tag>,
    },
    {
      title: t('orders.col.action'),
      render: (_v, row) => {
        if (row.status === 'PENDING') {
          return (
            <Button
              size="small"
              loading={busy === row.id}
              onClick={() => openResume(row.id)}
            >
              {t('orders.continuePay')}
            </Button>
          );
        }
        return null;
      },
      width: 120,
    },
  ], [t, busy]);

  return (
    <div className="max-w-5xl mx-auto">
      <Title level={3}>{t('orders.title')}</Title>

      {contracts && contracts.length > 0 && (
        <Card className="mb-4" title={t('orders.contracts.title')}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {contracts.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div>
                  <Space>
                    <strong>{c.price?.productName || c.price?.code}</strong>
                    <Tag color={contractStatusColor[c.status]}>
                      {t(`orders.contracts.status.${c.status}`, c.status)}
                    </Tag>
                    <span className="text-xs text-gray-500">
                      {c.provider === 'wechat'
                        ? t('pricing.checkout.wechat')
                        : t('pricing.checkout.alipay')}
                    </span>
                  </Space>
                  <div className="text-xs text-gray-500 mt-1">
                    {t('orders.contracts.nextCharge', { date: formatDate(c.nextChargeAt) })}
                    {c.failedCount > 0 && (
                      <span className="ml-2 text-red-500">
                        {t('orders.contracts.failedCount', { count: c.failedCount })}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <Button
                    size="small"
                    danger
                    disabled={c.status === 'TERMINATED' || c.status === 'PENDING'}
                    loading={unsignBusy === c.id}
                    onClick={() => unsignContract(c)}
                  >
                    {t('orders.contracts.unsign')}
                  </Button>
                </div>
              </div>
            ))}
            <div className="text-xs text-gray-400 mt-2">
              {t('orders.contracts.unsignHint')}
            </div>
          </Space>
        </Card>
      )}

      <Card>
        {orders === null ? (
          <div className="text-center text-gray-400 py-8">{t('dashboard.loading')}</div>
        ) : orders.length === 0 ? (
          <Empty description={t('orders.empty')} />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={orders}
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>

      <Modal
        title={t('pricing.checkout.title')}
        open={!!resumeOrder}
        onCancel={() => { setPolling(false); setResumeOrder(null); }}
        footer={null}
        destroyOnClose
      >
        {resumeOrder?.codeUrl ? (
          <div className="flex flex-col items-center gap-3">
            <QRCode value={resumeOrder.codeUrl} />
            <div className="text-xs text-gray-500">
              {t('pricing.checkout.orderId', { id: resumeOrder.id })}
            </div>
            <div className="text-xs text-gray-400">
              {t('pricing.checkout.qrExpires')}
            </div>
          </div>
        ) : resumeOrder?.redirectUrl ? (
          <a href={resumeOrder.redirectUrl} target="_blank" rel="noreferrer">
            {resumeOrder.provider === 'stripe'
              ? t('pricing.checkout.stripe')
              : t('pricing.checkout.alipay')}
          </a>
        ) : null}
      </Modal>
    </div>
  );
}
