import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Table, Tag, Space, Button, Input, Select, DatePicker, Card, message, Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import { adminApi } from '../../../api/adminClient';
import {
  CopyButton, formatDate, Money, ORDER_STATUS_COLOR, PROVIDER_LABEL,
  type OrderStatus, type PaymentOrderRow, type Provider, type RefundRow,
} from './_shared';
import RefundDrawer from './RefundDrawer';

const { RangePicker } = DatePicker;

const STATUS_OPTIONS: OrderStatus[] = ['CREATED', 'PENDING', 'PAID', 'CLOSED', 'REFUNDED', 'FAILED'];
const PROVIDER_OPTIONS: Provider[] = ['stripe', 'wechat', 'alipay'];

interface FilterState {
  q: string;
  status: OrderStatus | '';
  provider: Provider | '';
  range: [Dayjs | null, Dayjs | null] | null;
  page: number;
  pageSize: number;
}

const DEFAULT_FILTERS: FilterState = {
  q: '',
  status: '',
  provider: '',
  range: null,
  page: 1,
  pageSize: 20,
};

export default function Orders() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [orders, setOrders] = useState<PaymentOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [refundDrawer, setRefundDrawer] = useState<{ open: boolean; order: PaymentOrderRow | null }>(
    { open: false, order: null },
  );

  // Cache of refund histories keyed by order id, lazily filled when a row is
  // expanded. Avoids re-fetching when the user collapses & re-expands.
  const [refundCache, setRefundCache] = useState<Record<string, RefundRow[] | 'loading'>>({});

  const debounceRef = useRef<number | null>(null);

  const load = useCallback(
    async (current: FilterState) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: current.page,
          pageSize: current.pageSize,
        };
        if (current.q.trim()) params.q = current.q.trim();
        if (current.status) params.status = current.status;
        if (current.provider) params.provider = current.provider;
        if (current.range?.[0]) params.from = current.range[0].toISOString();
        if (current.range?.[1]) params.to = current.range[1].toISOString();

        const { data } = await adminApi.get('/payment-orders', { params });
        setOrders(data.orders || []);
        setTotal(data.total || 0);
        setRefundCache({}); // invalidate on every reload
      } catch (e: any) {
        message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Initial load + reload when non-text filters change.
  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.provider, filters.range, filters.page, filters.pageSize]);

  // Debounce text search separately so each keystroke doesn't fire a request.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      load({ ...filters, page: 1 });
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  async function loadRefundHistory(orderId: string) {
    if (refundCache[orderId] && refundCache[orderId] !== 'loading') return;
    setRefundCache((s) => ({ ...s, [orderId]: 'loading' }));
    try {
      const { data } = await adminApi.get(`/payment-orders/${orderId}`);
      setRefundCache((s) => ({ ...s, [orderId]: data?.order?.refunds || [] }));
    } catch {
      setRefundCache((s) => ({ ...s, [orderId]: [] }));
    }
  }

  const columns: ColumnsType<PaymentOrderRow> = useMemo(
    () => [
      {
        title: t('adminPayments.orders.col.time'),
        dataIndex: 'createdAt',
        width: 160,
        render: (v: string) => formatDate(v),
      },
      {
        title: t('adminPayments.orders.col.user'),
        width: 220,
        render: (_v, row) => row.user?.email || row.userId,
      },
      {
        title: t('adminPayments.orders.col.plan'),
        dataIndex: 'plan',
        width: 130,
        render: (v: string) => <Tag>{v}</Tag>,
      },
      {
        title: t('adminPayments.orders.col.months'),
        dataIndex: 'months',
        width: 70,
      },
      {
        title: t('adminPayments.orders.col.amount'),
        width: 180,
        render: (_v, row) => (
          <span>
            <Money cents={row.amountCents} currency={row.currency} />
            {row.refundedCents > 0 && (
              <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                {t('adminPayments.orders.refunded', {
                  amount: `${row.refundedCents / 100}`.replace(/\.00$/, ''),
                })}
              </span>
            )}
          </span>
        ),
      },
      {
        title: t('adminPayments.orders.col.provider'),
        dataIndex: 'provider',
        width: 90,
        render: (v: Provider) => <Tag>{PROVIDER_LABEL[v] || v}</Tag>,
      },
      {
        title: t('adminPayments.orders.col.status'),
        dataIndex: 'status',
        width: 110,
        render: (v: OrderStatus) => <Tag color={ORDER_STATUS_COLOR[v]}>{v}</Tag>,
      },
      {
        title: t('adminPayments.orders.col.providerOrderNo'),
        width: 240,
        render: (_v, row) => {
          const v = row.providerOrderNo || row.externalTradeNo;
          if (!v) return <span style={{ color: '#bbb' }}>—</span>;
          return (
            <Space size={4}>
              <code style={{ fontSize: 12 }}>{v}</code>
              <CopyButton text={v} />
            </Space>
          );
        },
      },
      {
        title: t('adminPayments.orders.col.actions'),
        width: 100,
        fixed: 'right',
        render: (_v, row) => (
          <Button
            size="small"
            disabled={row.status !== 'PAID' || row.refundedCents >= row.amountCents}
            onClick={() => setRefundDrawer({ open: true, order: row })}
          >
            {t('adminPayments.orders.refund')}
          </Button>
        ),
      },
    ],
    [t],
  );

  function exportCsv() {
    if (orders.length === 0) {
      message.info(t('adminPayments.orders.exportEmpty'));
      return;
    }
    const rows = orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      userEmail: o.user?.email || '',
      userId: o.userId,
      provider: o.provider,
      product: o.product,
      plan: o.plan,
      months: o.months,
      currency: o.currency,
      amountCents: o.amountCents,
      refundedCents: o.refundedCents,
      status: o.status,
      providerOrderNo: o.providerOrderNo || '',
      externalTradeNo: o.externalTradeNo || '',
      paidAt: o.paidAt || '',
    }));
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      const needsQuote = /[",\n]/.test(s);
      const x = s.replace(/"/g, '""');
      return needsQuote ? `"${x}"` : x;
    };
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtersDirty =
    filters.q || filters.status || filters.provider || filters.range !== null;

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[8, 8]}>
          <Input.Search
            allowClear
            placeholder={t('adminPayments.orders.filters.search')}
            value={filters.q}
            onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder={t('adminPayments.orders.filters.status')}
            style={{ width: 140 }}
            value={filters.status || undefined}
            onChange={(v) => setFilters((s) => ({ ...s, status: (v as OrderStatus) || '', page: 1 }))}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
          <Select
            allowClear
            placeholder={t('adminPayments.orders.filters.provider')}
            style={{ width: 130 }}
            value={filters.provider || undefined}
            onChange={(v) => setFilters((s) => ({ ...s, provider: (v as Provider) || '', page: 1 }))}
            options={PROVIDER_OPTIONS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
          />
          <RangePicker
            showTime
            value={filters.range as [Dayjs, Dayjs] | null}
            onChange={(v) =>
              setFilters((s) => ({
                ...s,
                range: v ? [v[0] || null, v[1] || null] : null,
                page: 1,
              }))
            }
          />
          {filtersDirty && (
            <Button onClick={() => setFilters(DEFAULT_FILTERS)}>
              {t('adminPayments.orders.filters.reset')}
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => load(filters)} loading={loading}>
            {t('adminPayments.common.refresh')}
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={orders.length === 0}>
            {t('adminPayments.common.exportCsv')}
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={orders}
        columns={columns}
        scroll={{ x: 1500 }}
        pagination={{
          current: filters.page,
          pageSize: filters.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (n) => `${n}`,
        }}
        onChange={(p) =>
          setFilters((s) => ({
            ...s,
            page: p.current || 1,
            pageSize: p.pageSize || 20,
          }))
        }
        expandable={{
          expandedRowRender: (row) => <RefundHistoryRow row={row} cache={refundCache} />,
          onExpand: (expanded, row) => {
            if (expanded) loadRefundHistory(row.id);
          },
        }}
      />

      <RefundDrawer
        open={refundDrawer.open}
        order={refundDrawer.order}
        onClose={() => setRefundDrawer({ open: false, order: null })}
        onRefunded={() => load(filters)}
      />
    </div>
  );
}

interface RefundHistoryProps {
  row: PaymentOrderRow;
  cache: Record<string, RefundRow[] | 'loading'>;
}

function RefundHistoryRow({ row, cache }: RefundHistoryProps) {
  const { t } = useTranslation();
  const value = cache[row.id];

  if (value === 'loading' || value === undefined) {
    return <div style={{ padding: 16, color: '#999' }}>{t('adminPayments.common.loading')}</div>;
  }
  const refunds = value;
  if (refunds.length === 0) {
    return (
      <Empty
        description={t('adminPayments.orders.noRefunds')}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: 12 }}
      />
    );
  }

  return (
    <Table
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={refunds}
      columns={[
        {
          title: t('adminPayments.orders.refundCol.time'),
          dataIndex: 'createdAt',
          render: (v: string) => formatDate(v),
          width: 180,
        },
        {
          title: t('adminPayments.orders.refundCol.amount'),
          dataIndex: 'amountCents',
          render: (v: number) => <Money cents={v} currency={row.currency} />,
          width: 130,
        },
        {
          title: t('adminPayments.orders.refundCol.reason'),
          dataIndex: 'reason',
          render: (v: string | null) => v || <span style={{ color: '#bbb' }}>—</span>,
        },
        {
          title: t('adminPayments.orders.refundCol.status'),
          dataIndex: 'status',
          width: 110,
          render: (v: string) => {
            const c = v === 'SUCCEEDED' ? 'success' : v === 'FAILED' ? 'error' : 'processing';
            return <Tag color={c}>{v}</Tag>;
          },
        },
        {
          title: t('adminPayments.orders.refundCol.externalNo'),
          dataIndex: 'externalRefundNo',
          width: 220,
          render: (v: string | null) =>
            v ? (
              <Space size={4}>
                <code style={{ fontSize: 12 }}>{v}</code>
                <CopyButton text={v} />
              </Space>
            ) : (
              <span style={{ color: '#bbb' }}>—</span>
            ),
        },
      ]}
    />
  );
}
