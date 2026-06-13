import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Row, Col, Card, Statistic, Spin, Empty, Alert, List, Tag, Space, Typography, Button,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import LazyECharts from '../../../components/LazyECharts';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';
import {
  formatDate, formatMoney, Money, PROVIDER_LABEL, type Provider,
} from './_shared';

interface OverviewData {
  generatedAt: string;
  today: { revenueCents: number; orderCount: number };
  activeSubscriptions: number;
  mrrByCurrency: Record<string, number>;
  sevenDaysSeries: Array<{ day: string; count: number; revenueCents: number }>;
  providerBreakdown: Array<{ provider: Provider; count: number; revenueCents: number }>;
  recentFailedRenewals: Array<{
    id: string;
    provider: Provider;
    failedCount: number;
    lastChargeAt: string | null;
    nextChargeAt: string | null;
    userEmail: string | null;
    priceCode: string | null;
    amountCents: number | null;
    currency: string | null;
  }>;
}

interface Props {
  onJumpContracts: () => void;
}

export default function Overview({ onJumpContracts }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminApi.get<OverviewData>('/payments/overview');
      setData(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // For mixed-currency setups we display the currency that contributes the
  // largest MRR; the rest is annotated as "(largest in X)".
  const dominantMrr = useMemo(() => {
    if (!data) return null;
    const entries = Object.entries(data.mrrByCurrency);
    if (entries.length === 0) return { currency: 'USD', cents: 0, mixed: false };
    entries.sort((a, b) => b[1] - a[1]);
    return {
      currency: entries[0][0],
      cents: entries[0][1],
      mixed: entries.length > 1,
    };
  }, [data]);

  const lineOption = useMemo(() => {
    if (!data) return null;
    const days = data.sevenDaysSeries.map((d) => d.day);
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any[]) => {
          const day = params[0]?.axisValue;
          const lines = params.map((p) =>
            p.seriesIndex === 0
              ? `${p.marker} ${p.seriesName}: ${formatMoney(Number(p.value), 'USD')}`
              : `${p.marker} ${p.seriesName}: ${p.value}`,
          );
          return `${day}<br/>${lines.join('<br/>')}`;
        },
      },
      legend: { data: [t('adminPayments.overview.trendRevenue'), t('adminPayments.overview.trendCount')] },
      grid: { left: 60, right: 60, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: days },
      yAxis: [
        {
          type: 'value',
          name: t('adminPayments.overview.trendRevenue'),
          axisLabel: { formatter: (v: number) => formatMoney(v, 'USD') },
        },
        { type: 'value', name: t('adminPayments.overview.trendCount') },
      ],
      series: [
        {
          name: t('adminPayments.overview.trendRevenue'),
          type: 'line',
          smooth: true,
          yAxisIndex: 0,
          areaStyle: { opacity: 0.2 },
          data: data.sevenDaysSeries.map((d) => d.revenueCents),
        },
        {
          name: t('adminPayments.overview.trendCount'),
          type: 'bar',
          yAxisIndex: 1,
          data: data.sevenDaysSeries.map((d) => d.count),
        },
      ],
    };
  }, [data, t]);

  const pieOption = useMemo(() => {
    if (!data) return null;
    const items = data.providerBreakdown.map((p) => ({
      name: PROVIDER_LABEL[p.provider] || p.provider,
      value: p.revenueCents,
    }));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const cur = data.providerBreakdown.find(
            (x) => (PROVIDER_LABEL[x.provider] || x.provider) === p.name,
          );
          return `${p.name}<br/>${formatMoney(p.value, 'USD')} · ${cur?.count ?? 0}`;
        },
      },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: items,
        },
      ],
    };
  }, [data]);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t('adminPayments.common.refresh')}
        </Button>
        {data && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatDate(data.generatedAt)}
          </Typography.Text>
        )}
      </Space>

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}

      <Spin spinning={loading && !data}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('adminPayments.overview.todayRevenue')}
                value={(data?.today.revenueCents ?? 0) / 100}
                precision={2}
                prefix={dominantMrr?.currency === 'CNY' ? '¥' : dominantMrr?.currency === 'EUR' ? '€' : '$'}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('adminPayments.overview.todayOrders')}
                value={data?.today.orderCount ?? 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('adminPayments.overview.activeSubscriptions')}
                value={data?.activeSubscriptions ?? 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('adminPayments.overview.mrr')}
                value={(dominantMrr?.cents ?? 0) / 100}
                precision={2}
                prefix={dominantMrr?.currency === 'CNY' ? '¥' : dominantMrr?.currency === 'EUR' ? '€' : '$'}
                suffix={
                  dominantMrr?.mixed && (
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {t('adminPayments.overview.mrrMixedHint', { currency: dominantMrr.currency })}
                    </span>
                  )
                }
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={16}>
            <Card title={t('adminPayments.overview.trendTitle')} bodyStyle={{ padding: 8 }}>
              {lineOption && data!.sevenDaysSeries.length > 0 ? (
                <LazyECharts option={lineOption} style={{ height: 300 }} />
              ) : (
                <Empty
                  description={t('adminPayments.overview.noData')}
                  style={{ padding: 60 }}
                />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title={t('adminPayments.overview.providerTitle')} bodyStyle={{ padding: 8 }}>
              {pieOption && data!.providerBreakdown.length > 0 ? (
                <LazyECharts option={pieOption} style={{ height: 300 }} />
              ) : (
                <Empty
                  description={t('adminPayments.overview.noData')}
                  style={{ padding: 60 }}
                />
              )}
            </Card>
          </Col>
        </Row>

        <Card
          title={t('adminPayments.overview.failedTitle')}
          style={{ marginTop: 16 }}
          extra={
            data && data.recentFailedRenewals.length > 0 ? (
              <Button type="link" onClick={onJumpContracts}>
                {t('adminPayments.overview.viewAll')} →
              </Button>
            ) : null
          }
        >
          {data && data.recentFailedRenewals.length === 0 ? (
            <Empty description={t('adminPayments.overview.failedEmpty')} />
          ) : (
            <List
              dataSource={data?.recentFailedRenewals || []}
              renderItem={(c) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Tag color="error">
                          {t('adminPayments.overview.failedFailedCount', { count: c.failedCount })}
                        </Tag>
                        <Tag>{PROVIDER_LABEL[c.provider] || c.provider}</Tag>
                        <span>{c.userEmail || '—'}</span>
                      </Space>
                    }
                    description={
                      <Space size="large">
                        <span>
                          {c.priceCode}
                          {' · '}
                          {c.amountCents !== null && (
                            <Money cents={c.amountCents} currency={c.currency || 'USD'} />
                          )}
                        </span>
                        <span style={{ color: '#999' }}>
                          last: {formatDate(c.lastChargeAt)} · next: {formatDate(c.nextChargeAt)}
                        </span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </Spin>
    </div>
  );
}
