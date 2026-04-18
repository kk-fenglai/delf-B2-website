import { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import PasswordStrengthBar from '../components/PasswordStrengthBar';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy';

const { Title } = Typography;

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();
  const [password, setPassword] = useState('');

  const onSubmit = async (values: { email: string; password: string; confirm: string; name?: string }) => {
    const v = validatePassword(values.password);
    if (!v.ok) {
      message.error(v.reasons.join('；'));
      return;
    }
    if (values.password !== values.confirm) {
      message.error(t('auth.reset.mismatch'));
      return;
    }
    try {
      const result = await register(values.email, values.password, values.name);
      if (result.emailVerificationRequired) {
        navigate(`/verification-sent?email=${encodeURIComponent(result.email)}`);
      } else {
        message.success(t('auth.registerSuccess'));
        navigate('/dashboard');
      }
    } catch (e: any) {
      const details = e.response?.data?.details;
      if (Array.isArray(details) && details.length) {
        message.error(details.map((d: any) => d.message).join('；'));
      } else {
        message.error(e.response?.data?.error || t('auth.registerFail'));
      }
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 440 }}>
        <Title level={3} className="text-center">{t('auth.register')}</Title>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item label={t('auth.nickname')} name="name">
            <Input placeholder={t('auth.nicknameOptional')} />
          </Form.Item>
          <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label={t('auth.password')}
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
            {t('auth.submitRegister')}
          </Button>
        </Form>
        <div className="text-center mt-4 text-sm">
          <Link to="/login">{t('auth.toLogin')}</Link>
        </div>
      </Card>
    </div>
  );
}
