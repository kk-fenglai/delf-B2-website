import { useEffect } from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Card, Typography, Button, Space, message } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

export default function StripeCheckoutReturn({ mode }: { mode: 'success' | 'cancel' }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const orderId = params.get('orderId');

  useEffect(() => {
    if (!orderId) {
      message.warning(t('orders.resume.missingOrderId'));
    }
  }, [orderId, t]);

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <Title level={3}>
          {mode === 'success' ? t('orders.resume.successTitle') : t('orders.resume.cancelTitle')}
        </Title>
        <Paragraph className="text-gray-600">
          {mode === 'success'
            ? t('orders.resume.successBody')
            : t('orders.resume.cancelBody')}
        </Paragraph>

        <Space>
          <RouterLink to={orderId ? `/orders?resume=${encodeURIComponent(orderId)}` : '/orders'}>
            <Button type="primary">{t('orders.resume.goOrders')}</Button>
          </RouterLink>
          <RouterLink to="/pricing">
            <Button>{t('orders.resume.backPricing')}</Button>
          </RouterLink>
        </Space>
      </Card>
    </div>
  );
}

