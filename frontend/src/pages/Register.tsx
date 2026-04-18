import { Form, Input, Button, Card, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';

const { Title } = Typography;

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();

  const onSubmit = async (values: { email: string; password: string; name?: string }) => {
    try {
      await register(values.email, values.password, values.name);
      message.success(t('auth.registerSuccess'));
      navigate('/dashboard');
    } catch (e: any) {
      message.error(e.response?.data?.error || t('auth.registerFail'));
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 400 }}>
        <Title level={3} className="text-center">{t('auth.register')}</Title>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item label={t('auth.nickname')} name="name">
            <Input placeholder={t('auth.nicknameOptional')} />
          </Form.Item>
          <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('auth.password')} name="password" rules={[{ required: true, min: 6 }]}>
            <Input.Password placeholder={t('auth.passwordHint')} />
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
