import { Card, Form, Input, Typography, Button, message } from 'antd';
import { useState } from 'react';
import { adminApi } from '../../api/adminClient';
import { useAdminAuth } from '../../stores/adminAuth';
import PasswordStrengthBar from '../../components/PasswordStrengthBar';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../../utils/passwordPolicy';

const { Title, Paragraph } = Typography;

export default function AdminChangePassword() {
  const [form] = Form.useForm();
  const { logout } = useAdminAuth();
  const [submitting, setSubmitting] = useState(false);
  const [newPwd, setNewPwd] = useState('');

  const onSubmit = async () => {
    const values = await form.validateFields();
    const v = validatePassword(values.newPassword);
    if (!v.ok) {
      message.error(v.reasons.join('；'));
      return;
    }
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.post('/auth/change-password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码修改成功，请重新登录');
      await logout();
      window.location.href = '/admin/login';
    } catch (e: any) {
      message.error(e.response?.data?.error || '修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Title level={3}>修改密码</Title>
      <Paragraph className="text-gray-500">
        修改后将撤销所有会话，需要重新登录。
      </Paragraph>
      <Card>
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item label="旧密码" name="oldPassword" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, min: PASSWORD_MIN_LENGTH }]}
          >
            <Input.Password autoComplete="new-password" onChange={(e) => setNewPwd(e.target.value)} />
          </Form.Item>
          <PasswordStrengthBar password={newPwd} />
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            保存并重新登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}

