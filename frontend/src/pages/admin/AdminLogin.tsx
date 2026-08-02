import { useState } from 'react';
import { Form, Input, Button, Alert } from 'antd';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAdminAuth } from '../../stores/adminAuth';
import MaterialIcon from '../../components/MaterialIcon';

/** Two-dot progress rail: 密码 → 邮箱验证码 */
function StepRail({ step }: { step: 0 | 1 }) {
  const dot = (index: 0 | 1, label: string) => {
    const done = step > index;
    const active = step === index;
    return (
      <div className={`flex items-center gap-2 ${active || done ? '' : 'opacity-40'}`}>
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
            active || done ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface'
          }`}
        >
          {done ? <MaterialIcon name="check" size={14} /> : index + 1}
        </div>
        <span className={`text-label-caps ${active || done ? 'text-primary' : 'text-on-surface'}`}>{label}</span>
      </div>
    );
  };

  return (
    <nav className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
      {dot(0, '密码')}
      <div className="h-px flex-grow mx-3 bg-outline-variant/50" />
      {dot(1, '邮箱验证码')}
    </nav>
  );
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginStep1, loginStep2, loading, pendingToken, clearPending } = useAdminAuth();
  const [step, setStep] = useState<0 | 1>(pendingToken ? 1 : 0);
  const [twoFaMessage, setTwoFaMessage] = useState('');
  const [emailDelivery, setEmailDelivery] = useState<'smtp' | 'console' | undefined>(undefined);
  const [error, setError] = useState('');

  const redirectAfterLogin = (() => {
    const from = (location.state as { from?: Location } | null)?.from?.pathname;
    return from && from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin';
  })();

  const onPassword = async (v: { email: string; password: string }) => {
    setError('');
    try {
      const r = await loginStep1(v.email, v.password);
      setTwoFaMessage(r.message);
      setEmailDelivery(r.emailDelivery);
      setStep(1);
    } catch (e: any) {
      setError(e.response?.data?.error || '登录失败');
    }
  };

  const onVerify = async (v: { code: string }) => {
    setError('');
    try {
      await loginStep2(v.code);
      navigate(redirectAfterLogin, { replace: true });
    } catch (e: any) {
      setError(e.response?.data?.error || '验证失败');
    }
  };

  const fieldWrap = 'auth-field transition-shadow';
  const inputClass = 'h-12 rounded-[10px]';
  const submitClass = 'h-12 rounded-xl font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98]';

  return (
    <div className="auth-admin-bg min-h-screen flex items-center justify-center p-4">
      <div className="auth-card w-full max-w-[440px] rounded-2xl bg-white/95 backdrop-blur-md border border-white/20 shadow-2xl p-6 sm:p-8">
        <header className="flex flex-col items-center text-center gap-1 mb-6">
          <div className="w-14 h-14 mb-3 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <MaterialIcon name="admin_panel_settings" size={32} fill />
          </div>
          <h1 className="text-headline-md text-on-surface m-0">管理员登录</h1>
          <p className="text-body-base text-on-surface-variant m-0">DELFluent Admin Console</p>
        </header>

        <StepRail step={step} />

        {error && <Alert type="error" message={error} showIcon className="mt-4" />}

        {step === 0 && (
          <Form layout="vertical" onFinish={onPassword} autoComplete="off" requiredMark={false} size="large" className="mt-5">
            <Form.Item
              name="email"
              label={<span className="text-label-caps uppercase text-on-surface-variant">邮箱</span>}
              rules={[{ required: true, type: 'email' }]}
            >
              <Input
                className={inputClass}
                rootClassName={fieldWrap}
                prefix={<MaterialIcon name="mail" size={20} className="text-outline mr-1" />}
                placeholder="admin@yourdomain.com"
              />
            </Form.Item>
            <Form.Item
              name="password"
              label={<span className="text-label-caps uppercase text-on-surface-variant">密码</span>}
              rules={[{ required: true }]}
            >
              <Input.Password
                className={inputClass}
                rootClassName={fieldWrap}
                prefix={<MaterialIcon name="lock" size={20} className="text-outline mr-1" />}
                placeholder="••••••••"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} className={submitClass}>
              下一步
            </Button>
            <div className="mt-4 text-center">
              <Link to="/admin/change-password" className="text-[13px] text-on-surface-variant hover:text-primary">
                修改密码（需先登录）
              </Link>
            </div>
          </Form>
        )}

        {step === 1 && (
          <Form layout="vertical" onFinish={onVerify} autoComplete="off" requiredMark={false} size="large" className="mt-5">
            {emailDelivery === 'console' && (
              <Alert
                type="warning"
                showIcon
                className="mb-4"
                message="当前未通过 SMTP 发信，邮箱里不会有验证码"
                description="请在运行后端服务的终端窗口查找以「📧」开头的日志，其中包含 6 位验证码。生产环境请在 backend/.env 配置 SMTP_HOST、SMTP_USER、SMTP_PASS 等变量。"
              />
            )}
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={emailDelivery === 'console'
                ? '验证码已生成，请按上方说明在服务器日志中查看'
                : (twoFaMessage || '验证码已发送到您的邮箱')}
              description={emailDelivery === 'console'
                ? '配置真实 SMTP 后，验证码会发到注册邮箱。'
                : '请查收邮件并输入 6 位验证码，10 分钟内有效。'}
            />
            <Form.Item
              name="code"
              label={<span className="text-label-caps uppercase text-on-surface-variant">6 位验证码</span>}
              rules={[{ required: true, len: 6, pattern: /^\d{6}$/ }]}
            >
              <Input
                className="h-14 rounded-[10px] text-center"
                rootClassName={fieldWrap}
                maxLength={6}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
                style={{ letterSpacing: 10, fontSize: 24, fontWeight: 600 }}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} className={submitClass}>
              验证并登录
            </Button>
            <Button block type="link" className="mt-2" onClick={() => { clearPending(); setStep(0); }}>
              返回上一步
            </Button>
          </Form>
        )}

        <div className="mt-6 pt-5 border-t border-outline-variant/40 flex items-center justify-center gap-2 text-center">
          <MaterialIcon name="verified_user" size={16} className="text-outline" />
          <p className="text-[11px] text-on-surface-variant m-0">
            所有登录活动均被记录 · 异常访问将自动锁定账户
          </p>
        </div>
      </div>
    </div>
  );
}
