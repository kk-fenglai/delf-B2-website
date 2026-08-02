import { Form, Input, Button, message, Modal } from 'antd';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { api } from '../api/client';
import MaterialIcon from '../components/MaterialIcon';

export default function Login() {
  const { t, i18n } = useTranslation();
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
              await api.post('/auth/resend-verification', { email, locale: i18n.language });
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

  const fieldWrap = 'auth-field transition-shadow';
  const inputClass = 'h-12 rounded-[10px] bg-white';

  return (
    <div className="flex justify-center">
      <div className="auth-card glass-panel w-full max-w-[440px] rounded-2xl p-6 sm:p-8 shadow-level-2">
        <div className="text-center mb-6 space-y-1">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <MaterialIcon name="school" size={30} fill />
          </div>
          <h1 className="text-headline-md text-on-surface m-0">{t('auth.login')}</h1>
          <p className="text-body-base text-on-surface-variant m-0">{t('auth.loginSubtitle')}</p>
        </div>

        <Form layout="vertical" onFinish={onSubmit} requiredMark={false} size="large">
          <Form.Item
            label={<span className="text-label-caps uppercase text-on-surface-variant">{t('auth.email')}</span>}
            name="email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input
              className={inputClass}
              rootClassName={fieldWrap}
              prefix={<MaterialIcon name="mail" size={20} className="text-outline mr-1" />}
              placeholder="your@email.com"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            label={(
              <div className="w-full flex items-center justify-between">
                <span className="text-label-caps uppercase text-on-surface-variant">{t('auth.password')}</span>
                <Link to="/forgot-password" className="text-[13px] font-semibold text-primary">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            )}
            name="password"
            rules={[{ required: true }]}
          >
            <Input.Password
              className={inputClass}
              rootClassName={fieldWrap}
              prefix={<MaterialIcon name="lock" size={20} className="text-outline mr-1" />}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            className="h-12 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {t('auth.submitLogin')}
          </Button>
        </Form>

        <div className="mt-6 pt-5 border-t border-outline-variant/40 text-center space-y-2">
          <p className="text-body-base text-on-surface-variant m-0">
            <Link to="/register" className="font-semibold text-primary">{t('auth.toRegister')}</Link>
          </p>
          <Link to="/change-password" className="text-[13px] text-on-surface-variant hover:text-primary">
            {t('auth.changePassword.fromLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
