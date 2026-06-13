import { useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { BulbOutlined, LockOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const AI_PLANS = ['AI', 'AI_UNLIMITED'];

/**
 * AI explanation for a CO/CE objective question, shown on the review page.
 * AI-plan users can lazily generate/fetch a detailed explanation; everyone
 * else sees an upgrade prompt linking to pricing.
 */
export default function AiExplanation({ sessionId, questionId }: { sessionId: string; questionId: string }) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const plan = user?.effectivePlan || user?.plan || 'FREE';
  const isAiUser = AI_PLANS.includes(plan);

  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (!isAiUser) {
    return (
      <Alert
        type="warning"
        showIcon
        icon={<LockOutlined />}
        className="mt-2"
        message={t('review.aiExplain.upsellTitle')}
        description={t('review.aiExplain.upsellDesc')}
        action={(
          <Link to="/pricing">
            <Button size="small" type="primary">{t('review.aiExplain.upgrade')}</Button>
          </Link>
        )}
      />
    );
  }

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get(
        `/sessions/${sessionId}/questions/${questionId}/explanation`,
        { params: { lang: i18n.language?.split('-')[0] || 'zh' } },
      );
      setText(data.explanation || '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (text) {
    return (
      <Alert
        type="info"
        showIcon
        icon={<BulbOutlined />}
        className="mt-2"
        message={t('review.aiExplain.title')}
        description={<div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>}
      />
    );
  }

  return (
    <div className="mt-2">
      <Button icon={<BulbOutlined />} onClick={load} loading={loading} disabled={loading}>
        {t('review.aiExplain.show')}
      </Button>
      {loading && <Spin size="small" className="ml-2" />}
      {error && (
        <Alert type="error" showIcon className="mt-2" message={t('review.aiExplain.error')} />
      )}
    </div>
  );
}
