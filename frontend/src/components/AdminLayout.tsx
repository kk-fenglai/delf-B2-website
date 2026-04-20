import { Layout, Menu, Dropdown, Avatar, Tag, Space, Typography } from 'antd';
import {
  DashboardOutlined, UserOutlined, FileTextOutlined, LogoutOutlined,
  SafetyCertificateOutlined, HistoryOutlined, BookOutlined,
} from '@ant-design/icons';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAdminAuth } from '../stores/adminAuth';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

export default function AdminLayout() {
  const { admin, logout, fetchMe } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!admin && localStorage.getItem('delfluent-admin-access')) {
      fetchMe();
    }
  }, [admin, fetchMe]);

  if (!admin && !localStorage.getItem('delfluent-admin-access')) {
    return <Navigate to="/admin/login" replace />;
  }

  const doLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const menu = [
    { key: '/admin/dashboard', icon: <DashboardOutlined />, label: <Link to="/admin/dashboard">Dashboard</Link> },
    { key: '/admin/users', icon: <UserOutlined />, label: <Link to="/admin/users">用户管理</Link> },
    { key: '/admin/exams', icon: <BookOutlined />, label: <Link to="/admin/exams">套题管理</Link> },
    { key: '/admin/logs', icon: <FileTextOutlined />, label: <Link to="/admin/logs">操作审计</Link> },
    { key: '/admin/logins', icon: <HistoryOutlined />, label: <Link to="/admin/logins">登录历史</Link> },
  ];

  const activeKey = menu.find((m) => location.pathname.startsWith(m.key))?.key || '/admin/dashboard';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220} breakpoint="lg" collapsedWidth={64}>
        <div style={{ color: '#fff', padding: 20, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
          🛡️ DELF Admin
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[activeKey]} items={menu} />
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <Space>
            <SafetyCertificateOutlined style={{ color: '#dc2626' }} />
            <Text strong>管理员控制台</Text>
            <Tag color={admin?.role === 'SUPER_ADMIN' ? 'red' : 'orange'}>
              {admin?.role || '—'}
            </Tag>
          </Space>
          <Dropdown
            menu={{
              items: [
                { key: 'info', disabled: true, label: (
                  <div>
                    <div>{admin?.email}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      上次登录 {admin?.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '—'}
                    </div>
                  </div>
                ) },
                { type: 'divider' },
                { key: 'site', label: <Link to="/">返回前台</Link> },
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: doLogout },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar style={{ background: '#dc2626' }} icon={<UserOutlined />} />
              <span>{admin?.name || admin?.email}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
