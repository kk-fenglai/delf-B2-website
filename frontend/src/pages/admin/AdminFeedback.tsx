import { useCallback, useEffect, useState } from 'react';
import {
  Table, Select, Typography, Tag, Space, Button, message, Drawer, Input, Descriptions,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;
const { TextArea } = Input;

interface FeedbackRow {
  id: string;
  userId?: string | null;
  email?: string | null;
  category: string;
  message: string;
  status: string;
  adminNote?: string | null;
  pageUrl?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  user?: { id: string; email: string; name?: string | null } | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  NEW: { label: '未读', color: 'red' },
  READ: { label: '已读', color: 'blue' },
  RESOLVED: { label: '已处理', color: 'green' },
};

const CATEGORY_LABEL: Record<string, string> = {
  SUGGESTION: '建议',
  BUG: '问题/Bug',
  CONTENT: '内容纠错',
  OTHER: '其他',
};

export default function AdminFeedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [active, setActive] = useState<FeedbackRow | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/feedback', {
        params: { status, category, page, pageSize },
      });
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, category, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: { status?: string; adminNote?: string }) => {
    setSaving(true);
    try {
      const { data } = await adminApi.patch(`/feedback/${id}`, body);
      message.success('已更新');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data.feedback } : r)));
      if (active?.id === id) setActive({ ...active, ...data.feedback });
    } catch (e: any) {
      message.error(e.response?.data?.error || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (row: FeedbackRow) => {
    setActive(row);
    setNote(row.adminNote || '');
    // Auto-mark NEW as READ when opened.
    if (row.status === 'NEW') patch(row.id, { status: 'READ' });
  };

  return (
    <div>
      <div className="admin-page-header">
        <Title level={3}>意见反馈</Title>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <Space className="admin-toolbar" wrap>
        <Select
          placeholder="状态" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          allowClear className="w-full sm:w-[160px]"
          options={Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))}
        />
        <Select
          placeholder="分类" value={category} onChange={(v) => { setCategory(v); setPage(1); }}
          allowClear className="w-full sm:w-[160px]"
          options={Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l }))}
        />
      </Space>

      <Table
        rowKey="id" dataSource={rows} loading={loading}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        onRow={(r) => ({ onClick: () => openDetail(r), style: { cursor: 'pointer' } })}
        columns={[
          { title: '时间', dataIndex: 'createdAt', width: 160, render: (d: string) => new Date(d).toLocaleString() },
          {
            title: '状态', dataIndex: 'status', width: 90,
            render: (s: string) => {
              const m = STATUS_META[s] || { label: s, color: 'default' };
              return <Tag color={m.color}>{m.label}</Tag>;
            },
          },
          {
            title: '分类', dataIndex: 'category', width: 110,
            render: (c: string) => <Tag>{CATEGORY_LABEL[c] || c}</Tag>,
          },
          { title: '内容', dataIndex: 'message', ellipsis: true },
          {
            title: '用户', width: 200, ellipsis: true,
            render: (_: any, r) => r.user?.email || r.email || <span style={{ color: '#aaa' }}>匿名</span>,
          },
        ]}
      />

      <Drawer
        title="反馈详情"
        open={!!active}
        onClose={() => setActive(null)}
        width={520}
      >
        {active && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="时间">{new Date(active.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="分类">{CATEGORY_LABEL[active.category] || active.category}</Descriptions.Item>
              <Descriptions.Item label="用户">
                {active.user?.email || active.email || '匿名'}
                {active.userId ? ` (${active.userId.slice(0, 10)}…)` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="页面">{active.pageUrl || '—'}</Descriptions.Item>
              <Descriptions.Item label="IP">{active.ip || '—'}</Descriptions.Item>
            </Descriptions>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>反馈内容</div>
              <div style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 12, borderRadius: 4 }}>
                {active.message}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>状态</div>
              <Select
                value={active.status}
                style={{ width: 200 }}
                onChange={(v) => patch(active.id, { status: v })}
                options={Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))}
              />
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>内部备注（仅管理员可见）</div>
              <TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              <Button
                type="primary" className="mt-2" loading={saving}
                onClick={() => patch(active.id, { adminNote: note })}
              >
                保存备注
              </Button>
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
