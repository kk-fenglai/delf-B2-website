import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table, Tag, Space, Button, Select, Card, message, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';
import {
  CONTRACT_STATUS_COLOR, CopyButton, formatDate, Money, PROVIDER_LABEL,
  stripeDashboardUrl, type ContractRow, type ContractStatus, type Provider,
} from './_shared';

const PROVIDER_OPTIONS: Provider[] = ['stripe', 'wechat', 'alipay'];
const STATUS_OPTIONS: ContractStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'];

interface FilterState {
  provider: Provider | '';
  status: ContractStatus | '';
  page: number;
  pageSize: number;
}

const DEFAULT_FILTERS: FilterState = {
  provider: '',
  status: '',
  page: 1,
  pageSize: 20,
};

export default function Contracts() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (current: FilterState) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: current.page,
          pageSize: current.pageSize,
        };
        if (current.provider) params.provider = current.provider;
        if (current.status) params.status = current.status;
        const { data } = await adminApi.get('/contracts', { params });
        setContracts(data.contracts || []);
        setTotal(data.total || 0);
      } catch (e: any) {
        message.error(e?.response?.data?.error || t('adminPayments.common.operationFailed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    load(filters);
  }, [load, filters]);

  async function terminate(c: ContractRow) {
    setBusyId(c.id);
    try {
      await adminApi.post(`/contracts/${c.id}/terminate`);
      message.success(t('adminPayments.contracts.terminated'));
      await load(filters);
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.contracts.terminateFailed'));
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnsType<ContractRow> = useMemo(
    () => [
      {
        title: t('adminPayments.contracts.col.createdAt'),
        dataIndex: 'createdAt',
        width: 160,
        render: (v: string) => formatDate(v),
      },
      {
        title: t('adminPayments.contracts.col.user'),
        width: 240,
        render: (_v, row) => row.user?.email || '—',
      },
      {
        title: t('adminPayments.contracts.col.provider'),
        dataIndex: 'provider',
        width: 90,
        render: (v: Provider) => <Tag>{PROVIDER_LABEL[v] || v}</Tag>,
      },
      {
        title: t('adminPayments.contracts.col.plan'),
        width: 200,
        render: (_v, row) => {
          if (!row.price) return <span style={{ color: '#bbb' }}>—</span>;
          return (
            <Space size={4}>
              <code style={{ fontSize: 12 }}>{row.price.code}</code>
              <span style={{ color: '#999' }}>·</span>
              <Money cents={row.price.amountCents} currency={row.price.currency || 'CNY'} />
            </Space>
          );
        },
      },
      {
        title: t('adminPayments.contracts.col.status'),
        dataIndex: 'status',
        width: 110,
        render: (v: ContractStatus) => <Tag color={CONTRACT_STATUS_COLOR[v]}>{v}</Tag>,
      },
      {
        title: t('adminPayments.contracts.col.nextChargeAt'),
        dataIndex: 'nextChargeAt',
        width: 160,
        render: (v: string | null) => formatDate(v),
      },
      {
        title: t('adminPayments.contracts.col.failedCount'),
        dataIndex: 'failedCount',
        width: 90,
        render: (v: number) => (v > 0 ? <Tag color="error">{v}</Tag> : <span>{v}</span>),
      },
      {
        title: t('adminPayments.contracts.col.externalContractId'),
        width: 260,
        render: (_v, row) => {
          const id = row.stripeSubscriptionId || row.externalContractId;
          if (!id) return <span style={{ color: '#bbb' }}>—</span>;
          return (
            <Space size={4}>
              <code style={{ fontSize: 12 }}>{id}</code>
              <CopyButton text={id} />
              {row.provider === 'stripe' && row.stripeSubscriptionId && (
                <a
                  href={stripeDashboardUrl('subscription', row.stripeSubscriptionId)}
                  target="_blank"
                  rel="noreferrer"
                  title={t('adminPayments.contracts.openSubscription')}
                >
                  <LinkOutlined />
                </a>
              )}
            </Space>
          );
        },
      },
      {
        title: t('adminPayments.contracts.col.actions'),
        width: 120,
        fixed: 'right',
        render: (_v, row) => (
          <Popconfirm
            title={t('adminPayments.contracts.terminateConfirm')}
            onConfirm={() => terminate(row)}
            disabled={row.status === 'TERMINATED'}
            okText={t('adminPayments.contracts.terminate')}
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              loading={busyId === row.id}
              disabled={row.status === 'TERMINATED'}
            >
              {t('adminPayments.contracts.terminate')}
            </Button>
          </Popconfirm>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, busyId],
  );

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[8, 8]}>
          <Select
            allowClear
            placeholder={t('adminPayments.contracts.filters.provider')}
            style={{ width: 130 }}
            value={filters.provider || undefined}
            onChange={(v) => setFilters((s) => ({ ...s, provider: (v as Provider) || '', page: 1 }))}
            options={PROVIDER_OPTIONS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
          />
          <Select
            allowClear
            placeholder={t('adminPayments.contracts.filters.status')}
            style={{ width: 140 }}
            value={filters.status || undefined}
            onChange={(v) =>
              setFilters((s) => ({ ...s, status: (v as ContractStatus) || '', page: 1 }))
            }
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load(filters)} loading={loading}>
            {t('adminPayments.common.refresh')}
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={contracts}
        columns={columns}
        scroll={{ x: 1400 }}
        pagination={{
          current: filters.page,
          pageSize: filters.pageSize,
          total,
          showSizeChanger: true,
        }}
        onChange={(p) =>
          setFilters((s) => ({
            ...s,
            page: p.current || 1,
            pageSize: p.pageSize || 20,
          }))
        }
      />
    </div>
  );
}
