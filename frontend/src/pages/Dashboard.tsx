import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Empty, List, Button, Skeleton, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import ScorePredictionCard from '../components/ScorePredictionCard';
import PageLoader from '../components/PageLoader';
import { localizeExamTitle } from '../utils/examTitle';

const SkillRadarChart = lazy(() => import('../components/SkillRadarChart'));

const { Title } = Typography;

export default function Dashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/user/progress').then((r) => setData(r.data));
  }, []);

  const radarOption = useMemo(() => {
    if (!data) return null;
    return {
      radar: {
        indicator: ['CO', 'CE', 'PE', 'PO'].map((s) => ({ name: t(`skill.${s}`), max: 100 })),
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: ['CO', 'CE', 'PE', 'PO'].map(
                (s) => data.skillStats.find((x: any) => x.skill === s)?.accuracy || 0,
              ),
              name: '%',
              areaStyle: { opacity: 0.3 },
              lineStyle: { color: '#1A3A5C' },
              itemStyle: { color: '#1A3A5C' },
            },
          ],
        },
      ],
    };
  }, [data, t]);

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto">
        <Skeleton active paragraph={{ rows: 1 }} className="mb-6" />
        <Row gutter={16}>
          <Col xs={12} md={6}><Card><Skeleton active /></Card></Col>
          <Col xs={12} md={6}><Card><Skeleton active /></Card></Col>
          <Col xs={24} md={12}><Card><Skeleton active /></Card></Col>
        </Row>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <Title level={2}>{t('dashboard.greeting', { name: user?.name || user?.email })}</Title>

      <Row gutter={16} className="mb-6">
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('dashboard.attemptsDone')} value={data.totalAttempts} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title={t('dashboard.setsDone')} value={data.recentSessions.length} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-gray-500">{t('dashboard.nextStep')}</div>
                <div className="font-semibold text-lg">{t('dashboard.startToday')}</div>
              </div>
              <Link to="/practice">
                <Button type="primary" size="large">{t('dashboard.enterPractice')}</Button>
              </Link>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title={t('dashboard.radarTitle')} className="mb-4">
            {data.skillStats.length === 0 ? (
              <Empty description={t('dashboard.noData')} />
            ) : radarOption ? (
              <Suspense fallback={<PageLoader />}>
                <SkillRadarChart option={radarOption} />
              </Suspense>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={t('dashboard.recentSessions')} className="mb-4">
            {data.recentSessions.length === 0 ? (
              <Empty description={t('dashboard.noSessions')} />
            ) : (
              <List
                dataSource={data.recentSessions}
                renderItem={(s: any) => (
                  <List.Item
                    actions={[
                      <Link key="review" to={`/review/${s.id}`}>{t('dashboard.viewDetail')}</Link>,
                    ]}
                  >
                    <List.Item.Meta
                      title={(
                        <span>
                          {localizeExamTitle(s.title, t)}
                          {s.isUserOwned && (
                            <Tag color="cyan" className="ml-2">{t('dashboard.userOwnedTag')}</Tag>
                          )}
                        </span>
                      )}
                      description={new Date(s.completedAt).toLocaleDateString()}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <ScorePredictionCard />
    </div>
  );
}
