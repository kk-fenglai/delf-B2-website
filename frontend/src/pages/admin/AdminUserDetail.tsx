import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Table, Space, Button, Spin, Typography, message,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

interface Detail {
  user: any;
  loginHistory: Array<{
    id: string; ip?: string; userAgent?: string; success: boolean;
    reason?: string; createdAt: string;
  }>;
  sessions: Array<{
    id: string; examSetId: string; examSet?: { title: string };
    startedAt: string; completedAt?: string; totalScore?: number; maxScore?: number;
  }>;
  attemptCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green', SUSPENDED: 'orange', DELETED: 'red',
};

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get(`/users/${id}`);
      setData(data);
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!data) return <div>用户不存在</div>;
  const u = data.user;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Link to="/admin/users"><Button icon={<ArrowLeftOutlined />}>返回</Button></Link>
        <Title level={3} style={{ margin: 0 }}>{u.email}</Title>
        <Tag color={STATUS_COLORS[u.status]}>{u.status}</Tag>
        <Tag color="blue">{u.plan}</Tag>
        {u.role !== 'USER' && <Tag color="red">{u.role}</Tag>}
        {u.emailVerified === false && <Tag color="orange">未验证邮箱</Tag>}
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="ID">{u.id}</Descriptions.Item>
          <Descriptions.Item label="昵称">{u.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="套餐">{u.plan}</Descriptions.Item>
          <Descriptions.Item label="订阅到期">
            {u.subscriptionEnd ? new Date(u.subscriptionEnd).toLocaleString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="登录次数">{u.loginCount}</Descriptions.Item>
          <Descriptions.Item label="连续失败">{u.failedLoginCount}</Descriptions.Item>
          <Descriptions.Item label="锁定至">
            {u.lockedUntil ? new Date(u.lockedUntil).toLocaleString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="最后登录">
            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'} {u.lastLoginIp ? `(${u.lastLoginIp})` : ''}
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">{new Date(u.createdAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="软删除时间">
            {u.deletedAt ? new Date(u.deletedAt).toLocaleString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="累计答题">{data.attemptCount}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="登录历史（最近 20 条）" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id" size="small" dataSource={data.loginHistory} pagination={false}
          columns={[
            { title: '时间', dataIndex: 'createdAt', render: (d: string) => new Date(d).toLocaleString() },
            {
              title: '结果', dataIndex: 'success',
              render: (s: boolean, r) => (
                <Tag color={s ? 'green' : 'red'}>{s ? '成功' : r.reason || '失败'}</Tag>
              ),
            },
            { title: 'IP', dataIndex: 'ip' },
            { title: 'User-Agent', dataIndex: 'userAgent', ellipsis: true },
          ]}
        />
      </Card>

      <Card title="最近练习会话">
        <Table
          rowKey="id" size="small" dataSource={data.sessions} pagination={false}
          columns={[
            { title: '套题', render: (_, r) => r.examSet?.title || r.examSetId },
            { title: '开始', dataIndex: 'startedAt', render: (d: string) => new Date(d).toLocaleString() },
            {
              title: '完成', dataIndex: 'completedAt',
              render: (d?: string) => d ? new Date(d).toLocaleString() : <Tag>未完成</Tag>,
            },
            {
              title: '得分', render: (_, r) =>
                r.totalScore != null ? `${r.totalScore} / ${r.maxScore}` : '—',
            },
          ]}
        />
      </Card>
    </div>
  );
}
