import { Card, Form, Input, Typography, Button, message } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import PasswordStrengthBar from '../components/PasswordStrengthBar';
import { validatePassword, formatPasswordReasons, PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy';

const { Title, Paragraph } = Typography;

export default function ChangePassword() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const [newPwd, setNewPwd] = useState('');

  const onSubmit = async () => {
    const values = await form.validateFields();
    const v = validatePassword(values.newPassword);
    if (!v.ok) {
      message.error(formatPasswordReasons(v.reasons, t));
      return;
    }
    if (values.newPassword !== values.confirmPassword) {
      message.error(t('auth.reset.mismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/user/change-password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success(t('auth.changePassword.success'));
      await logout();
      navigate('/login', { replace: true });
    } catch (e: any) {
      message.error(e.response?.data?.error || t('auth.changePassword.fail'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <Title level={3}>{t('auth.changePassword.title')}</Title>
      <Paragraph className="text-gray-500">{t('auth.changePassword.subtitle')}</Paragraph>
      <Card>
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label={t('auth.changePassword.oldPassword')}
            name="oldPassword"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label={t('auth.changePassword.newPassword')}
            name="newPassword"
            rules={[{ required: true, min: PASSWORD_MIN_LENGTH }]}
          >
            <Input.Password autoComplete="new-password" onChange={(e) => setNewPwd(e.target.value)} />
          </Form.Item>
          <PasswordStrengthBar password={newPwd} />
          <Form.Item
            label={t('auth.changePassword.confirmPassword')}
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            {t('auth.changePassword.submit')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
