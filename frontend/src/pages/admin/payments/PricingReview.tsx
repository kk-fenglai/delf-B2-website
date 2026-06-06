import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, message, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';

const { Text } = Typography;

// Mirrors backend GET /api/admin/pricing-report response.
type ReportRow = {
  priceId: string;
  priceCode: string;
  months: number;
  currency: 'CNY' | 'USD' | 'EUR';
  amountCents: number;
  amountDisplay: string;
  eurEquivalent: number | null;
  eurAnchor: number | null;
  deviationPct: number | null;
};
type ProductReport = {
  productCode: string;
  productName: string;
  plan: string;
  rows: ReportRow[];
};
type Report = {
  report: ProductReport[];
  fx: {
    rates: { EUR: number; USD: number; CNY: number; date: string };
    fetchedAt: string;
    cached: boolean;
    source: string;
  };
};

// Deviation past this triggers an orange tag; past ALERT_PCT it goes red.
// 5% is normal FX wobble; 10%+ usually means the price needs a refresh.
const WARN_PCT = 5;
const ALERT_PCT = 10;

function deviationTagColor(pct: number | null): string | undefined {
  if (pct == null) return undefined;
  const abs = Math.abs(pct);
  if (abs >= ALERT_PCT) return 'red';
  if (abs >= WARN_PCT) return 'orange';
  return 'green';
}

const SYMBOL: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };

export default function PricingReview() {
  const { t } = useTranslation();
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await adminApi.get<Report>('/pricing-report');
      setData(r.data);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to load report';
      setErr(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnsType<ReportRow> = [
    {
      title: t('adminPayments.pricingReview.col.months'),
      dataIndex: 'months',
      width: 90,
      render: (m: number) => (m === 1 ? t('adminPayments.pricingReview.monthly') : `${m}m`),
    },
    {
      title: t('adminPayments.pricingReview.col.currency'),
      dataIndex: 'currency',
      width: 110,
      render: (c: string) => <Tag>{c}</Tag>,
    },
    {
      title: t('adminPayments.pricingReview.col.listed'),
      dataIndex: 'amountDisplay',
      render: (v: string, row) => (
        <Text strong>{SYMBOL[row.currency] || ''}{v}</Text>
      ),
    },
    {
      title: t('adminPayments.pricingReview.col.eurEquivalent'),
      dataIndex: 'eurEquivalent',
      render: (v: number | null, row) => {
        const val = v ?? (row as ReportRow & { usdEquivalent?: number | null }).usdEquivalent;
        return val == null ? '—' : `€${val.toFixed(2)}`;
      },
    },
    {
      title: (
        <Tooltip title={t('adminPayments.pricingReview.col.eurAnchorTip')}>
          {t('adminPayments.pricingReview.col.eurAnchor')}
        </Tooltip>
      ),
      dataIndex: 'eurAnchor',
      render: (v: number | null, row) => {
        const val = v ?? (row as ReportRow & { usdAnchor?: number | null }).usdAnchor;
        return val == null ? '—' : `€${val.toFixed(2)}`;
      },
    },
    {
      title: (
        <Tooltip title={t('adminPayments.pricingReview.col.deviationTip', { warn: WARN_PCT, alert: ALERT_PCT })}>
          {t('adminPayments.pricingReview.col.deviation')}
        </Tooltip>
      ),
      dataIndex: 'deviationPct',
      render: (pct: number | null, row) => {
        if (pct == null) return '—';
        const color = deviationTagColor(pct);
        if (row.currency === 'EUR') {
          return <Text type="secondary">0.0%</Text>;
        }
        const sign = pct > 0 ? '+' : '';
        return <Tag color={color}>{`${sign}${pct.toFixed(1)}%`}</Tag>;
      },
    },
    {
      title: t('adminPayments.pricingReview.col.priceCode'),
      dataIndex: 'priceCode',
      render: (v: string) => <Text code className="text-xs">{v}</Text>,
    },
  ];

  return (
    <Card
      title={t('adminPayments.pricingReview.title')}
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t('adminPayments.pricingReview.refresh')}
        </Button>
      }
    >
      {data && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message={
            <span>
              {t('adminPayments.pricingReview.fxLine', {
                usd: data.fx.rates.USD?.toFixed(4),
                cny: data.fx.rates.CNY?.toFixed(4),
                date: data.fx.rates.date,
              })}
              {data.fx.cached && (
                <Tag color="default" className="ml-2">
                  {t('adminPayments.pricingReview.cached')}
                </Tag>
              )}
            </span>
          }
        />
      )}

      {err && (
        <Alert className="mb-4" type="error" showIcon message={err} />
      )}

      {loading && !data ? (
        <div className="flex justify-center py-10"><Spin size="large" /></div>
      ) : (
        <div className="space-y-6">
          {(data?.report || []).map((prod) => (
            <Card
              key={prod.productCode}
              size="small"
              title={
                <span>
                  <Text strong>{prod.productName}</Text>
                  <Tag className="ml-2" color="blue">{prod.plan}</Tag>
                  <Text type="secondary" className="ml-2 text-xs">{prod.productCode}</Text>
                </span>
              }
            >
              <Table
                rowKey="priceId"
                size="small"
                pagination={false}
                columns={columns}
                dataSource={prod.rows}
              />
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
