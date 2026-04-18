import { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Alert } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const { Title, Paragraph } = Typography;

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (values: { email: string }) => {
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: values.email });
      setSent(true);
    } catch (e: any) {
      message.error(e.response?.data?.error || t('auth.forgot.fail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 440 }}>
        <Title level={3} className="text-center">{t('auth.forgot.title')}</Title>
        <Paragraph type="secondary" className="text-center">{t('auth.forgot.subtitle')}</Paragraph>
        {sent ? (
          <Alert
            type="success"
            showIcon
            message={t('auth.forgot.sentTitle')}
            description={t('auth.forgot.sentDesc')}
            style={{ marginTop: 12 }}
          />
        ) : (
          <Form layout="vertical" onFinish={onSubmit} style={{ marginTop: 8 }}>
            <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {t('auth.forgot.submit')}
            </Button>
          </Form>
        )}
        <div className="text-center mt-4 text-sm">
          <Link to="/login">{t('auth.forgot.backToLogin')}</Link>
        </div>
      </Card>
    </div>
  );
}
