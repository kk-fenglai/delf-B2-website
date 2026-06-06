import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Spin, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const { Title, Paragraph } = Typography;

interface SessionStatus {
  status: string;
  payment_status: string;
  orderId?: string | null;
}

export default function StripeCheckoutComplete() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const orderId = params.get('orderId');

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError(t('pricing.checkout.missingCheckoutSession'));
      setLoading(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      try {
        const { data } = await api.get('/pay/stripe/session-status', {
          params: { session_id: sessionId },
        });
        if (cancelled) return;
        setSession(data);
        if (data.status === 'complete' || data.status === 'expired' || attempts >= 8) {
          setLoading(false);
          return;
        }
        attempts += 1;
        setTimeout(poll, 1500);
      } catch {
        if (!cancelled) {
          setError(t('pricing.checkout.createFailed'));
          setLoading(false);
        }
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [sessionId, t]);

  const resolvedOrderId = session?.orderId || orderId;
  const success = session?.status === 'complete' && session?.payment_status === 'paid';

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        {loading ? (
          <div className="text-center py-10">
            <Spin size="large" />
            <Paragraph className="mt-4 mb-0" style={{ color: 'var(--textMuted)' }}>
              {t('pricing.checkout.completeLoading')}
            </Paragraph>
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={error} />
        ) : success ? (
          <>
            <div className="text-center mb-4">
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
            </div>
            <Title level={3} className="text-center">
              {t('pricing.checkout.completeSuccess')}
            </Title>
            <Paragraph className="text-center" style={{ color: 'var(--textMuted)' }}>
              {t('orders.resume.successBody')}
            </Paragraph>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
            </div>
            <Title level={3} className="text-center">
              {t('pricing.checkout.completeFailed')}
            </Title>
          </>
        )}

        <div className="flex justify-center gap-3 mt-6 flex-wrap">
          <Link to={resolvedOrderId ? `/orders?resume=${encodeURIComponent(resolvedOrderId)}` : '/orders'}>
            <Button type="primary">{t('orders.resume.goOrders')}</Button>
          </Link>
          <Link to="/pricing">
            <Button>{t('orders.resume.backPricing')}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
