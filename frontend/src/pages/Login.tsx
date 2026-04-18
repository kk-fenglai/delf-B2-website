import { Form, Input, Button, Card, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';

const { Title } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();

  const onSubmit = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      message.success(t('auth.loginSuccess'));
      navigate('/dashboard');
    } catch (e: any) {
      message.error(e.response?.data?.error || t('auth.loginFail'));
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 400 }}>
        <Title level={3} className="text-center">{t('auth.login')}</Title>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="demo@delfluent.com" />
          </Form.Item>
          <Form.Item label={t('auth.password')} name="password" rules={[{ required: true, min: 6 }]}>
            <Input.Password placeholder="demo1234" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {t('auth.submitLogin')}
          </Button>
        </Form>
        <div className="text-center mt-4 text-sm">
          <Link to="/register">{t('auth.toRegister')}</Link>
        </div>
      </Card>
    </div>
  );
}
