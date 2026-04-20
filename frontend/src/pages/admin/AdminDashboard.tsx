import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Spin, Tag, Progress } from 'antd';
import {
  UserOutlined, CrownOutlined, DollarCircleOutlined, RiseOutlined,
  ExperimentOutlined, StopOutlined,
} from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    adminApi.get('/stats/overview').then(({ data }) => setStats(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!stats) return <div>加载失败</div>;

  const conv = (stats.paid.conversionRate * 100).toFixed(1);

  return (
    <div>
      <Title level={3}>数据概览</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="总用户数" value={stats.users.total} prefix={<UserOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="活跃付费用户" value={stats.paid.active}
              prefix={<CrownOutlined />} valueStyle={{ color: '#ea580c' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="MRR (估算)" value={stats.mrr} prefix="¥"
              suffix="/ mo" valueStyle={{ color: '#059669' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="7 日新增" value={stats.users.newLast7d}
              prefix={<RiseOutlined />} valueStyle={{ color: '#2563eb' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="用户状态分布">
            <Row gutter={16}>
              <Col span={8}><Statistic title="活跃" value={stats.users.active}
                valueStyle={{ color: '#059669' }} /></Col>
              <Col span={8}><Statistic title="已停用" value={stats.users.suspended}
                prefix={<StopOutlined />} valueStyle={{ color: '#d97706' }} /></Col>
              <Col span={8}><Statistic title="已删除" value={stats.users.deleted}
                valueStyle={{ color: '#6b7280' }} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="付费转化率">
            <Progress percent={parseFloat(conv)} status="active" />
            <div style={{ marginTop: 8, color: '#6b7280' }}>
              {stats.paid.total} 付费用户 / {stats.users.total} 总用户
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="套餐分布">
            {Object.entries(stats.planDistribution).map(([plan, count]: any) => (
              <div key={plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <Tag color={plan === 'FREE' ? 'default' : plan === 'AI_UNLIMITED' ? 'gold' : plan === 'AI' ? 'purple' : 'blue'}>
                  {plan}
                </Tag>
                <strong>{count}</strong>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="练习活跃度">
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="近 7 日 Session" value={stats.sessions.last7d} prefix={<ExperimentOutlined />} />
              </Col>
              <Col span={12}>
                <Statistic title="累计 Session" value={stats.sessions.total} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
