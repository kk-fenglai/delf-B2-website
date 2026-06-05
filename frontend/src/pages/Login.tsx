import { Form, Input, Button, Card, Typography, message, Modal } from 'antd';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';

const { Title } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading } = useAuthStore();

  const redirectAfterLogin = (() => {
    const from = (location.state as { from?: Location } | null)?.from?.pathname;
    return from && from !== '/login' ? from : '/dashboard';
  })();

  const onSubmit = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      message.success(t('auth.loginSuccess'));
      navigate(redirectAfterLogin, { replace: true });
    } catch (e: any) {
      const status = e.response?.status;
      const code = e.response?.data?.code;
      if (status === 403 && code === 'EMAIL_NOT_VERIFIED') {
        const email = e.response?.data?.email || values.email;
        Modal.confirm({
          title: t('auth.verify.requiredTitle'),
          content: t('auth.verify.requiredDesc', { email }),
          okText: t('auth.sent.resend'),
          cancelText: t('auth.common.cancel'),
          onOk: async () => {
            try {
              await api.post('/auth/resend-verification', { email });
              message.success(t('auth.sent.resent'));
            } catch (err: any) {
              message.error(err.response?.data?.error || t('auth.sent.resendFail'));
            }
          },
        });
      } else if (status === 403 && code === 'USE_ADMIN_LOGIN') {
        message.info(e.response?.data?.error || t('auth.useAdminLogin'));
        navigate('/admin/login');
      } else {
        message.error(e.response?.data?.error || t('auth.loginFail'));
      }
    }
  };

  return (
    <div className="flex justify-center pt-12">
      <Card style={{ width: 400 }}>
        <Title level={3} className="text-center">{t('auth.login')}</Title>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="your@email.com" />
          </Form.Item>
          <Form.Item label={t('auth.password')} name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            style={{ backgroundColor: '#1d4ed8', borderColor: '#1d4ed8', color: '#fff' }}
          >
            {t('auth.submitLogin')}
          </Button>
        </Form>
        <div className="mt-4 text-sm space-y-2">
          <div className="flex justify-between items-center">
            <Link to="/register">{t('auth.toRegister')}</Link>
            <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
          </div>
          <div className="text-center">
            <Link to="/change-password">{t('auth.changePassword.fromLogin')}</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
