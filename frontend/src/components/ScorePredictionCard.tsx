import { useEffect, useState } from 'react';
import { Card, Progress, Tag, Typography, Button, Empty, Space } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Prediction, PredictionVerdict } from '../types';

const { Title, Paragraph, Text } = Typography;

const verdictColor: Record<PredictionVerdict, string> = {
  likely_pass: '#52c41a',
  borderline: '#faad14',
  at_risk_gate: '#ff4d4f',
  unlikely_pass: '#ff4d4f',
  insufficient: '#8c8c8c',
};

const verdictIcon: Record<PredictionVerdict, string> = {
  likely_pass: '✅',
  borderline: '🟡',
  at_risk_gate: '⚠️',
  unlikely_pass: '❌',
  insufficient: '📊',
};

export default function ScorePredictionCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/user/prediction')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card title={t('prediction.card.title')}>
        <Paragraph className="text-gray-500 mb-0">{t('dashboard.loading')}</Paragraph>
      </Card>
    );
  }

  if (!data || data.totalAttempts === 0) {
    return (
      <Card title={t('prediction.card.title')}>
        <Empty
          description={t('prediction.card.emptyDesc')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Link to="/practice">
            <Button type="primary">{t('prediction.card.emptyCta')}</Button>
          </Link>
        </Empty>
      </Card>
    );
  }

  const verdict = data.verdict;
  const color = verdictColor[verdict];
  const icon = verdictIcon[verdict];
  const { passTotal, passPerSkill } = data.thresholds;

  // For the gauge on the card, show the verified points (CO+CE) as a gauge
  // against PASS_TOTAL_MIN. It communicates "how close to the pass line your
  // auto-gradable score is" without overclaiming PE/PO.
  const pctToPass = Math.min(100, Math.round((data.total.verifiedPoints / passTotal) * 100));

  return (
    <Card
      title={t('prediction.card.title')}
      extra={
        <Link to="/dashboard/prediction">
          <Button type="link">{t('prediction.card.viewDetail')}</Button>
        </Link>
      }
    >
      <div className="flex items-center gap-6 flex-wrap">
        <Progress
          type="dashboard"
          percent={pctToPass}
          strokeColor={color}
          format={() => (
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color }}>
                {data.total.verifiedPoints.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">
                {t('prediction.card.ofTotal', { total: passTotal })}
              </div>
            </div>
          )}
        />

        <div className="flex-1 min-w-[200px]">
          <Space direction="vertical" size="small" className="w-full">
            <Title level={4} style={{ marginBottom: 0, color }}>
              {icon} {t(`prediction.verdict.${verdict}`)}
            </Title>
            <Text type="secondary">
              {t('prediction.card.verifiedRange', {
                lower: data.total.lowerBound.toFixed(1),
                upper: data.total.upperBound.toFixed(1),
              })}
            </Text>
            <Text type="secondary" className="text-xs">
              {t('prediction.card.note', {
                perSkill: passPerSkill,
                total: passTotal,
              })}
            </Text>

            <div className="mt-2 flex flex-wrap gap-2">
              {(['CO', 'CE', 'PE', 'PO'] as const).map((s) => {
                const ps = data.perSkill[s];
                let tagColor = 'default';
                let label = '—';
                if (ps.status === 'pending_ai') {
                  tagColor = 'default';
                  label = t('prediction.pending');
                } else if (ps.status === 'insufficient') {
                  tagColor = 'default';
                  label = t('prediction.noData');
                } else {
                  tagColor = ps.belowPassGate ? 'red' : 'blue';
                  label = `${ps.predictedScore.toFixed(1)}/25`;
                }
                return (
                  <Tag key={s} color={tagColor}>
                    {t(`skill.${s}`)} · {label}
                  </Tag>
                );
              })}
            </div>
          </Space>
        </div>
      </div>
    </Card>
  );
}
