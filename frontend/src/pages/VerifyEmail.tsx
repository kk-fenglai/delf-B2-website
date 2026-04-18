import { useEffect, useState } from 'react';
import { Card, Typography, Result, Button, Spin } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const { Title } = Typography;

type Status = 'loading' | 'ok' | 'expired' | 'invalid';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const resultQS = params.get('result'); // may be set when backend redirects
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    // If backend redirected with ?result=ok|expired|invalid, just honor that.
    if (resultQS === 'ok') { setStatus('ok'); return; }
    if (resultQS === 'expired') { setStatus('expired'); return; }
    if (resultQS === 'invalid' || !token) { setStatus('invalid'); return; }

    api.post('/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch((e) => {
        const msg = e.response?.data?.error || '';
        if (/过期|expired/i.test(msg)) setStatus('expired');
        else setStatus('invalid');
      });
  }, [token, resultQS]);

  if (status === 'loading') {
    return (
      <div className="flex justify-center pt-12">
        <Card style={{ width: 440, textAlign: 'center' }}>
          <Spin size="large" />
          <Title level={5} style={{ marginTop: 16 }}>{t('auth.verify.verifying')}</Title>
        </Card>
      </div>
    );
  }

  if (status === 'ok') {
    return (
      <div className="flex justify-center pt-12">
        <Result
          status="success"
          title={t('auth.verify.successTitle')}
          subTitle={t('auth.verify.successDesc')}
          extra={<Link to="/login"><Button type="primary">{t('auth.verify.toLogin')}</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center pt-12">
      <Result
        status="warning"
        title={status === 'expired' ? t('auth.verify.expiredTitle') : t('auth.verify.invalidTitle')}
        subTitle={status === 'expired' ? t('auth.verify.expiredDesc') : t('auth.verify.invalidDesc')}
        extra={<Link to="/login"><Button type="primary">{t('auth.verify.toLogin')}</Button></Link>}
      />
    </div>
  );
}
