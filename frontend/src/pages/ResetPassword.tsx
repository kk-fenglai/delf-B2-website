import { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Alert } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PasswordStrengthBar from '../components/PasswordStrengthBar';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy';

const { Title, Paragraph } = Typography;

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="flex justify-center pt-12">
        <Card style={{ width: 440 }}>
          <Alert type="error" showIcon message={t('auth.reset.missingToken')} />
          <div className="text-center mt-4">
            <Link to="/forgot-password">{t('auth.reset.requestNew')}</Link>
          </div>
        </Card>
      </div>
    );
  }

  const onSubmit = async (values: { password: string; confirm: string }) => {
    const v = validatePassword(values.password);
    if (!v.ok) {
      message.error(v.reasons.join('；'));
      return;
    }
    if (values.password !== values.confirm) {
      message.error(t('auth.reset.mismatch'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.password });
      message.success(t('auth.reset.success'));
      navigate('/login');
    } catch (e: any) {
      message.error(e.response?.data?.error || t('auth.reset.fail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 440 }}>
        <Title level={3} className="text-center">{t('auth.reset.title')}</Title>
        <Paragraph type="secondary" className="text-center">{t('auth.reset.subtitle')}</Paragraph>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label={t('auth.reset.newPassword')}
            name="password"
            rules={[{ required: true, min: PASSWORD_MIN_LENGTH }]}
          >
            <Input.Password onChange={(e) => setPassword(e.target.value)} />
          </Form.Item>
          <PasswordStrengthBar password={password} />
          <Form.Item
            label={t('auth.reset.confirmPassword')}
            name="confirm"
            rules={[{ required: true }]}
            style={{ marginTop: 16 }}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {t('auth.reset.submit')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
