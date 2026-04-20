import { useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Breadcrumb,
  Row,
  Col,
  Statistic,
  Table,
  Empty,
  Button,
  Tag,
  Alert,
  Progress,
} from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactECharts from 'echarts-for-react';
import { api } from '../api/client';
import type { Prediction, PredictionVerdict, PredictionRecommendation, Skill } from '../types';

const { Title, Paragraph, Text } = Typography;

const verdictColor: Record<PredictionVerdict, string> = {
  likely_pass: '#52c41a',
  borderline: '#faad14',
  at_risk_gate: '#ff4d4f',
  unlikely_pass: '#ff4d4f',
  insufficient: '#8c8c8c',
};

function recText(t: (k: string, v?: any) => string, r: PredictionRecommendation) {
  switch (r.type) {
    case 'gate_risk':
      return t('prediction.recommendation.gate_risk', {
        skill: t(`skill.${r.skill}`),
        score: r.predictedScore?.toFixed(1),
      });
    case 'sample_low':
      return t('prediction.recommendation.sample_low', {
        skill: t(`skill.${r.skill}`),
        n: r.sampleSize,
        needed: r.needed,
      });
    case 'near_line':
      return t('prediction.recommendation.near_line', {
        skill: t(`skill.${r.skill}`),
        score: r.predictedScore?.toFixed(1),
      });
    case 'ai_upsell':
      return t('prediction.recommendation.ai_upsell');
    default:
      return '';
  }
}

export default function DashboardPrediction() {
  const { t } = useTranslation();
  const [data, setData] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/user/prediction')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Paragraph>{t('dashboard.loading')}</Paragraph>;

  const breadcrumb = (
    <Breadcrumb
      className="mb-3"
      items={[
        { title: <Link to="/dashboard">{t('nav.dashboard')}</Link> },
        { title: t('prediction.page.title') },
      ]}
    />
  );

  if (!data || data.totalAttempts === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        {breadcrumb}
        <Card>
          <Empty description={t('prediction.card.emptyDesc')}>
            <Link to="/practice">
              <Button type="primary">{t('prediction.card.emptyCta')}</Button>
            </Link>
          </Empty>
        </Card>
      </div>
    );
  }

  const { verdict, perSkill, total, thresholds, whatIfScenarios, minPePoNeeded, recommendations } =
    data;
  const color = verdictColor[verdict];

  const radarOption = {
    radar: {
      indicator: (['CO', 'CE', 'PE', 'PO'] as const).map((s) => ({
        name: `${t(`skill.${s}`)} (/${thresholds.skillMax})`,
        max: thresholds.skillMax,
      })),
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: (['CO', 'CE', 'PE', 'PO'] as const).map((s) => {
              const ps = perSkill[s];
              return ps.status === 'ready' ? ps.predictedScore : 0;
            }),
            name: t('prediction.page.radarLabel'),
            areaStyle: { opacity: 0.3 },
            lineStyle: { color: '#1A3A5C' },
            itemStyle: { color: '#1A3A5C' },
          },
        ],
      },
    ],
  };

  return (
    <div className="max-w-5xl mx-auto">
      {breadcrumb}
      <Title level={2}>{t('prediction.page.title')}</Title>
      <Paragraph className="text-gray-500">{t('prediction.page.subtitle')}</Paragraph>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={t('prediction.page.verifiedScore')}
              value={total.verifiedPoints}
              precision={1}
              suffix={` / ${thresholds.passTotal}`}
              valueStyle={{ color }}
            />
            <Text type="secondary" className="text-xs">
              {t('prediction.card.verifiedRange', {
                lower: total.lowerBound.toFixed(1),
                upper: total.upperBound.toFixed(1),
              })}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Title level={4} style={{ color, marginBottom: 4 }}>
              {t(`prediction.verdict.${verdict}`)}
            </Title>
            <Text type="secondary">
              {t('prediction.page.rule', {
                perSkill: thresholds.passPerSkill,
                total: thresholds.passTotal,
              })}
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={t('prediction.page.minPePoNeeded')}
              value={
                minPePoNeeded === null
                  ? t('prediction.page.minPePoUnknown')
                  : minPePoNeeded.toFixed(1)
              }
              suffix={minPePoNeeded === null ? '' : ` / ${2 * thresholds.skillMax}`}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} md={12}>
          <Card title={t('prediction.page.perSkillTitle')}>
            {(['CO', 'CE', 'PE', 'PO'] as const).map((s) => {
              const ps = perSkill[s];
              return (
                <div key={s} className="mb-3">
                  <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                    <span>
                      <strong>{t(`skill.${s}`)}</strong>{' '}
                      {ps.status === 'pending_ai' && (
                        <Tag color="default">{t('prediction.pending')}</Tag>
                      )}
                      {ps.status === 'insufficient' && (
                        <Tag color="default">{t('prediction.noData')}</Tag>
                      )}
                      {ps.status === 'ready' && (
                        <Tag color={ps.confidence === 'high' ? 'green' : ps.confidence === 'medium' ? 'blue' : 'orange'}>
                          {t(`prediction.confidence.${ps.confidence}`)} · {ps.sampleSize} {t('prediction.page.questions')}
                        </Tag>
                      )}
                    </span>
                    <span className="text-sm text-gray-500">
                      {ps.status === 'ready'
                        ? `${ps.predictedScore.toFixed(1)} / ${thresholds.skillMax}`
                        : '—'}
                    </span>
                  </div>
                  <Progress
                    percent={
                      ps.status === 'ready'
                        ? Math.round((ps.predictedScore / thresholds.skillMax) * 100)
                        : 0
                    }
                    strokeColor={ps.belowPassGate ? '#ff4d4f' : '#1A3A5C'}
                    showInfo={false}
                  />
                  {ps.status === 'ready' && ps.belowPassGate && (
                    <div className="text-xs text-red-500 mt-1">
                      ⚠️ {t('prediction.page.belowGate', {
                        min: thresholds.passPerSkill,
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title={t('prediction.page.radarTitle')}>
            <ReactECharts option={radarOption} style={{ height: 300 }} />
            <Text type="secondary" className="text-xs">
              {t('prediction.page.radarNote')}
            </Text>
          </Card>
        </Col>
      </Row>

      {whatIfScenarios.length > 0 && (
        <Card title={t('prediction.page.whatIfTitle')} className="mb-4">
          <Paragraph className="text-gray-500">{t('prediction.page.whatIfDesc')}</Paragraph>
          <Table
            dataSource={whatIfScenarios.map((s, i) => ({ ...s, key: i }))}
            pagination={false}
            columns={[
              {
                title: t('prediction.page.peScore'),
                dataIndex: 'pePoints',
                render: (v) => `${v} / ${thresholds.skillMax}`,
              },
              {
                title: t('prediction.page.poScore'),
                dataIndex: 'poPoints',
                render: (v) => `${v} / ${thresholds.skillMax}`,
              },
              {
                title: t('prediction.page.totalScore'),
                dataIndex: 'total',
                render: (v) => `${v.toFixed(1)} / ${thresholds.passTotal * 2}`,
              },
              {
                title: t('prediction.page.passes'),
                dataIndex: 'passes',
                render: (v) => (
                  <Tag color={v ? 'success' : 'error'}>
                    {v ? `✓ ${t('prediction.page.pass')}` : `✗ ${t('prediction.page.fail')}`}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card title={t('prediction.page.recsTitle')} className="mb-4">
          {recommendations.map((r, i) => (
            <Alert
              key={i}
              className="mb-2"
              type={
                r.type === 'gate_risk'
                  ? 'error'
                  : r.type === 'sample_low'
                    ? 'warning'
                    : r.type === 'ai_upsell'
                      ? 'info'
                      : 'warning'
              }
              showIcon
              message={recText(t, r)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}
