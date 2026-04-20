import { useState } from 'react';
import { Card, Typography, Button, message, Result } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const { Paragraph } = Typography;

export default function VerificationSent() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [loading, setLoading] = useState(false);

  const resend = async () => {
    if (!email) {
      message.warning(t('auth.sent.noEmail'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/resend-verification', { email });
      message.success(t('auth.sent.resent'));
    } catch (e: any) {
      message.error(e.response?.data?.error || t('auth.sent.resendFail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 480 }}>
        <Result
          status="info"
          title={t('auth.sent.title')}
          subTitle={
            <>
              <Paragraph>{t('auth.sent.desc', { email })}</Paragraph>
              <Paragraph type="secondary">{t('auth.sent.hint')}</Paragraph>
            </>
          }
          extra={[
            <Button key="resend" onClick={resend} loading={loading}>
              {t('auth.sent.resend')}
            </Button>,
            <Link key="login" to="/login"><Button type="primary">{t('auth.sent.toLogin')}</Button></Link>,
          ]}
        />
      </Card>
    </div>
  );
}
