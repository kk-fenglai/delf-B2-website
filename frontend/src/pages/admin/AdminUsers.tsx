import { useCallback, useEffect, useState } from 'react';
import {
  Table, Input, Select, Button, Space, Tag, Dropdown, Modal, Form, InputNumber,
  Typography, message, Radio,
} from 'antd';
import type { MenuProps } from 'antd';
import { Link } from 'react-router-dom';
import { MoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';
import { useAdminAuth } from '../../stores/adminAuth';
import PasswordStrengthBar from '../../components/PasswordStrengthBar';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../../utils/passwordPolicy';

const { Title } = Typography;

interface UserRow {
  id: string;
  email: string;
  emailMasked: string;
  name?: string;
  plan: string;
  status: string;
  role: string;
  subscriptionEnd?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  loginCount: number;
  createdAt: string;
}

const PLAN_COLORS: Record<string, string> = {
  FREE: 'default', STANDARD: 'blue', AI: 'purple', AI_UNLIMITED: 'gold',
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green', SUSPENDED: 'orange', DELETED: 'red',
};

export default function AdminUsers() {
  const { admin } = useAdminAuth();
  const isSuper = admin?.role === 'SUPER_ADMIN';
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<string | undefined>();
  const [status, setStatus] = useState<string>('ACTIVE');
  const [role, setRole] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/users', {
        params: { q, plan, status, role, page, pageSize },
      });
      setRows(data.users);
      setTotal(data.total);
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [q, plan, status, role, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const act = async (userId: string, path: string, body?: any, config?: any) => {
    try {
      await adminApi.post(`/users/${userId}${path}`, body || {}, config);
      message.success('操作成功');
      load();
    } catch (e: any) {
      if (e.response?.data?.code === 'RECONFIRM_REQUIRED') throw e;
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const del = async (userId: string, hard = false, adminPwd?: string) => {
    try {
      await adminApi.delete(`/users/${userId}${hard ? '?hard=true' : ''}`, {
        headers: hard && adminPwd ? { 'X-Admin-Password': adminPwd } : undefined,
      });
      message.success(hard ? '永久删除成功' : '已软删除');
      load();
    } catch (e: any) {
      if (e.response?.data?.code === 'RECONFIRM_REQUIRED') throw e;
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const confirmAction = (title: string, body: string, onOk: () => Promise<void>) => {
    Modal.confirm({ title, content: body, onOk, okButtonProps: { danger: true } });
  };

  const reconfirmPassword = (title: string): Promise<string> =>
    new Promise((resolve, reject) => {
      let pwd = '';
      Modal.confirm({
        title,
        content: (
          <Input.Password
            placeholder="请再次输入您（当前管理员）的登录密码"
            onChange={(e) => { pwd = e.target.value; }}
          />
        ),
        okText: '确认',
        onOk: () => { if (pwd) resolve(pwd); else reject(new Error('no pwd')); },
        onCancel: () => reject(new Error('cancelled')),
      });
    });

  const onResetPassword = async (u: UserRow) => {
    let mode: 'email' | 'direct' = 'email';
    let newPwd = '';
    Modal.confirm({
      title: `重置 ${u.email} 的密码`,
      width: 480,
      content: (
        <div>
          <Radio.Group defaultValue="email" onChange={(e) => (mode = e.target.value)}>
            <Radio value="email">发送重置链接到用户邮箱</Radio>
            {isSuper && <Radio value="direct">直接设置新密码（需密码二次确认）</Radio>}
          </Radio.Group>
          <div style={{ marginTop: 12 }}>
            <Input.Password
              placeholder="仅「直接设置」模式需要，至少 10 位"
              onChange={(e) => (newPwd = e.target.value)}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        try {
          if (mode === 'direct') {
            if (!newPwd) { message.error('请输入新密码'); return Promise.reject(); }
            const v = validatePassword(newPwd);
            if (!v.ok) { message.error(v.reasons.join('；')); return Promise.reject(); }
            try {
              const pwd = await reconfirmPassword('请输入您的管理员密码');
              await adminApi.post(`/users/${u.id}/reset-password`,
                { mode: 'direct', newPassword: newPwd },
                { headers: { 'X-Admin-Password': pwd } });
              message.success('密码已重置');
              load();
            } catch { /* cancelled */ }
          } else {
            await adminApi.post(`/users/${u.id}/reset-password`, { mode: 'email' });
            message.success('重置邮件已发送');
          }
        } catch (e: any) {
          message.error(e.response?.data?.error || '重置失败');
        }
      },
    });
  };

  const onChangePlan = (u: UserRow) => {
    let newPlan = u.plan;
    let months = 0;
    Modal.confirm({
      title: `修改 ${u.email} 的套餐`,
      width: 480,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>套餐</div>
          <Select
            defaultValue={u.plan}
            style={{ width: '100%' }}
            onChange={(v) => (newPlan = v)}
            options={['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'].map((p) => ({ value: p, label: p }))}
          />
          <div style={{ marginTop: 12, marginBottom: 8 }}>订阅延长（月）</div>
          <InputNumber min={0} max={60} defaultValue={0} onChange={(v) => (months = Number(v || 0))} style={{ width: '100%' }} />
        </div>
      ),
      onOk: () => act(u.id, '/change-plan', { plan: newPlan, months }),
    });
  };

  const rowMenu = (u: UserRow): MenuProps['items'] => [
    { key: 'detail', label: <Link to={`/admin/users/${u.id}`}>查看详情</Link> },
    { key: 'plan', label: '修改套餐', onClick: () => onChangePlan(u) },
    { key: 'reset', label: '重置密码', onClick: () => onResetPassword(u) },
    {
      key: 'sus', label: u.status === 'SUSPENDED' ? '解除停用' : '停用账户',
      onClick: () => act(u.id, '/suspend', { suspend: u.status !== 'SUSPENDED' }),
    },
    {
      key: 'revoke', label: '强制下线（撤销会话）',
      onClick: () => confirmAction('强制下线', `将立即使 ${u.email} 的所有登录会话失效。`,
        () => act(u.id, '/revoke-sessions')),
    },
    ...(isSuper && u.role === 'USER' ? [{
      key: 'imp', label: '假登录（体验用户视角）',
      onClick: () => act(u.id, '/impersonate'),
    }] : []),
    { type: 'divider' as const },
    ...(u.status === 'DELETED' ? [{
      key: 'restore', label: '恢复账户',
      onClick: () => act(u.id, '/restore'),
    }] : [{
      key: 'del', label: '软删除账户', danger: true,
      onClick: () => confirmAction('软删除账户',
        `${u.email} 将被标记为已删除（可恢复）。`, () => del(u.id, false)),
    }]),
    ...(isSuper && u.role === 'USER' ? [{
      key: 'hard', label: '永久删除（不可逆）', danger: true,
      onClick: async () => {
        try {
          const pwd = await reconfirmPassword('永久删除：请输入您的管理员密码');
          await del(u.id, true, pwd);
        } catch { /* cancelled */ }
      },
    }] : []),
  ];

  const columns = [
    {
      title: '邮箱', dataIndex: 'email', render: (e: string, r: UserRow) => (
        <Link to={`/admin/users/${r.id}`}>{e}</Link>
      ),
    },
    { title: '昵称', dataIndex: 'name' },
    {
      title: '套餐', dataIndex: 'plan',
      render: (p: string) => <Tag color={PLAN_COLORS[p]}>{p}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status',
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    { title: '角色', dataIndex: 'role', render: (r: string) => r !== 'USER' ? <Tag color="red">{r}</Tag> : r },
    {
      title: '最后登录', dataIndex: 'lastLoginAt',
      render: (d?: string) => d ? new Date(d).toLocaleString() : '—',
    },
    { title: '登录次数', dataIndex: 'loginCount' },
    {
      title: '操作', key: 'action',
      render: (_: any, r: UserRow) => (
        <Dropdown menu={{ items: rowMenu(r) }} trigger={['click']}>
          <Button icon={<MoreOutlined />} size="small" />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3}>用户管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          {isSuper && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建用户
            </Button>
          )}
        </Space>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索邮箱 / 昵称"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={() => { setPage(1); load(); }}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          placeholder="套餐" value={plan} onChange={setPlan} allowClear style={{ width: 140 }}
          options={['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'].map((p) => ({ value: p, label: p }))}
        />
        <Select
          placeholder="状态" value={status} onChange={setStatus} style={{ width: 140 }}
          options={[
            { value: 'ACTIVE', label: '活跃' },
            { value: 'SUSPENDED', label: '已停用' },
            { value: 'DELETED', label: '已软删除' },
            { value: 'ALL', label: '全部' },
          ]}
        />
        <Select
          placeholder="角色" value={role} onChange={setRole} allowClear style={{ width: 160 }}
          options={[
            { value: 'USER', label: 'USER' },
            { value: 'ADMIN', label: 'ADMIN' },
            { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
          ]}
        />
      </Space>

      <Table
        rowKey="id" dataSource={rows} columns={columns} loading={loading}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      <CreateUserModal open={createOpen} onClose={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onOk = async () => {
    try {
      const values = await form.validateFields();
      const v = validatePassword(values.password);
      if (!v.ok) { message.error(v.reasons.join('；')); return; }
      setSubmitting(true);
      await adminApi.post('/users', values);
      message.success('用户已创建');
      form.resetFields();
      setPassword('');
      onClose();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.error || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onOk={onOk} onCancel={onClose} title="新建用户" confirmLoading={submitting} width={520}>
      <Form form={form} layout="vertical" initialValues={{ plan: 'FREE', role: 'USER', months: 0, emailVerified: true }}>
        <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="昵称" name="name">
          <Input />
        </Form.Item>
        <Form.Item label="初始密码" name="password" rules={[{ required: true, min: PASSWORD_MIN_LENGTH }]}>
          <Input.Password onChange={(e) => setPassword(e.target.value)} />
        </Form.Item>
        <PasswordStrengthBar password={password} />
        <Form.Item label="套餐" name="plan" style={{ marginTop: 16 }}>
          <Select options={['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'].map((p) => ({ value: p, label: p }))} />
        </Form.Item>
        <Form.Item label="角色" name="role">
          <Select options={[
            { value: 'USER', label: 'USER' },
            { value: 'ADMIN', label: 'ADMIN' },
            { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
          ]} />
        </Form.Item>
        <Form.Item label="订阅（月）" name="months">
          <InputNumber min={0} max={60} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
