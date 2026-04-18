import { useCallback, useEffect, useState } from 'react';
import { Table, Input, Typography, Tag, Space, Button, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

interface Row {
  id: string;
  userId: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
  createdAt: string;
}

export default function AdminLoginHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/stats/login-history', {
        params: { userId: userId || undefined, page, pageSize },
      });
      setRows(data.history || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3}>登录历史</Title>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="用户 ID 过滤（可选）"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
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
          { title: '用户 ID', dataIndex: 'userId', width: 230, ellipsis: true },
          {
            title: '结果', width: 160, render: (_: any, r: Row) =>
              <Tag color={r.success ? 'green' : 'red'}>{r.success ? '成功' : (r.reason || '失败')}</Tag>,
          },
          { title: 'IP', dataIndex: 'ip', width: 130 },
          { title: 'User-Agent', dataIndex: 'userAgent', ellipsis: true },
        ]}
      />
    </div>
  );
}
