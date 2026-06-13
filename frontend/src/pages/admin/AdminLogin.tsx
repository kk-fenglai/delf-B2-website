import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Space, Steps } from 'antd';
import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAdminAuth } from '../../stores/adminAuth';

const { Title, Text } = Typography;

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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#1e293b 0%,#7f1d1d 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <Card className="w-full max-w-[420px]" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SafetyOutlined style={{ fontSize: 48, color: '#dc2626' }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>管理员登录</Title>
          <Text type="secondary">DELFluent Admin Console</Text>
        </div>

        <Steps
          size="small"
          current={step}
          style={{ marginBottom: 24 }}
          items={[{ title: '密码' }, { title: '邮箱验证码' }]}
        />

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

        {step === 0 && (
          <Form layout="vertical" onFinish={onPassword} autoComplete="off">
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
              <Input prefix={<MailOutlined />} placeholder="admin@yourdomain.com" size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading} danger>
              下一步
            </Button>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link to="/admin/change-password">修改密码（需先登录）</Link>
            </div>
          </Form>
        )}

        {step === 1 && (
          <Form layout="vertical" onFinish={onVerify} autoComplete="off">
            {emailDelivery === 'console' && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="当前未通过 SMTP 发信，邮箱里不会有验证码"
                description="请在运行后端服务的终端窗口查找以「📧」开头的日志，其中包含 6 位验证码。生产环境请在 backend/.env 配置 SMTP_HOST、SMTP_USER、SMTP_PASS 等变量。"
              />
            )}
            <Alert
              type="info" showIcon style={{ marginBottom: 16 }}
              message={emailDelivery === 'console'
                ? '验证码已生成，请按上方说明在服务器日志中查看'
                : (twoFaMessage || '验证码已发送到您的邮箱')}
              description={emailDelivery === 'console'
                ? '配置真实 SMTP 后，验证码会发到注册邮箱。'
                : '请查收邮件并输入 6 位验证码，10 分钟内有效。'}
            />
            <Form.Item
              name="code" label="6 位验证码"
              rules={[{ required: true, len: 6, pattern: /^\d{6}$/ }]}
            >
              <Input size="large" maxLength={6} placeholder="123456" autoFocus
                style={{ letterSpacing: 8, fontSize: 22, textAlign: 'center' }} />
            </Form.Item>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button type="primary" htmlType="submit" block size="large" loading={loading} danger>
                验证并登录
              </Button>
              <Button block type="link" onClick={() => { clearPending(); setStep(0); }}>
                返回上一步
              </Button>
            </Space>
          </Form>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
          🔒 所有登录活动均被记录。异常访问将自动锁定账户。
        </div>
      </Card>
    </div>
  );
}
