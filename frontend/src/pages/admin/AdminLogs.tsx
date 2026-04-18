import { useCallback, useEffect, useState } from 'react';
import { Table, Input, Select, Typography, Tag, Space, Button, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

interface LogRow {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  payload?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

const ACTIONS = [
  'ADMIN_LOGIN', 'ADMIN_LOGOUT',
  'USER_CREATE', 'USER_UPDATE',
  'PLAN_CHANGE', 'RENEW',
  'PASSWORD_RESET_EMAIL_SENT', 'PASSWORD_RESET_DIRECT',
  'SUSPEND', 'UNSUSPEND', 'DELETE_SOFT', 'DELETE_HARD', 'RESTORE',
  'IMPERSONATE', 'REVOKE_SESSIONS',
];

export default function AdminLogs() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [action, setAction] = useState<string | undefined>();
  const [targetId, setTargetId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/stats/logs', {
        params: {
          adminId: adminId || undefined,
          action,
          targetId: targetId || undefined,
          page, pageSize,
        },
      });
      setRows(data.logs || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [adminId, action, targetId, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3}>操作审计</Title>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input placeholder="管理员 ID" value={adminId} onChange={(e) => setAdminId(e.target.value)} style={{ width: 200 }} allowClear />
        <Select
          placeholder="操作类型" value={action} onChange={setAction} allowClear style={{ width: 220 }}
          options={ACTIONS.map((a) => ({ value: a, label: a }))}
        />
        <Input placeholder="目标 ID（用户 ID 等）" value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: 220 }} allowClear />
        <Button type="primary" onClick={() => { setPage(1); load(); }}>查询</Button>
      </Space>

      <Table
        rowKey="id" dataSource={rows} loading={loading}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        columns={[
          { title: '时间', dataIndex: 'createdAt', width: 170, render: (d: string) => new Date(d).toLocaleString() },
          { title: '管理员 ID', dataIndex: 'adminId', width: 230, ellipsis: true },
          { title: '操作', dataIndex: 'action', width: 180, render: (a: string) => <Tag color="geekblue">{a}</Tag> },
          { title: '目标', width: 180, render: (_: any, r) => `${r.targetType}${r.targetId ? ' · ' + r.targetId.slice(0, 10) + '…' : ''}` },
          { title: 'IP', dataIndex: 'ip', width: 130 },
          {
            title: '详情', dataIndex: 'payload',
            render: (p?: string) => p ? (
              <pre style={{ margin: 0, fontSize: 11, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</pre>
            ) : '—',
          },
        ]}
      />
    </div>
  );
}
