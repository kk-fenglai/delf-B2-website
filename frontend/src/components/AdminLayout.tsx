import {
  Layout, Menu, Dropdown, Avatar, Tag, Space, Typography, theme as antdTheme,
} from 'antd';
import {
  DashboardOutlined, UserOutlined, FileTextOutlined, LogoutOutlined,
  SafetyCertificateOutlined, HistoryOutlined, BookOutlined, CreditCardOutlined,
  KeyOutlined,
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
  const { token } = antdTheme.useToken();

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
    { key: '/admin/payments', icon: <CreditCardOutlined />, label: <Link to="/admin/payments">支付管理</Link> },
    { key: '/admin/logs', icon: <FileTextOutlined />, label: <Link to="/admin/logs">操作审计</Link> },
    { key: '/admin/logins', icon: <HistoryOutlined />, label: <Link to="/admin/logins">登录历史</Link> },
  ];

  const activeKey = menu.find((m) => location.pathname.startsWith(m.key))?.key || '/admin/dashboard';

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgBase }}>
      <Sider
        width={220}
        breakpoint="lg"
        collapsedWidth={64}
        style={{
          background: token.colorBgContainer,
        }}
      >
        <div className="app-hero-bg" style={{ color: token.colorText, padding: 20, fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>
          🛡️ DELF Admin
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          items={menu}
          style={{ background: 'transparent', borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: token.colorBgContainer, padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Space>
            <SafetyCertificateOutlined style={{ color: '#dc2626' }} />
            <Text strong style={{ color: token.colorText }}>管理员控制台</Text>
            <Tag color={admin?.role === 'SUPER_ADMIN' ? 'red' : 'orange'}>
              {admin?.role || '—'}
            </Tag>
          </Space>
          <Space>
            <Dropdown
              menu={{
                items: [
                  { key: 'info', disabled: true, label: (
                    <div>
                      <div>{admin?.email}</div>
                      <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                        上次登录 {admin?.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '—'}
                      </div>
                    </div>
                  ) },
                  { type: 'divider' },
                  { key: 'pwd', icon: <KeyOutlined />, label: <Link to="/admin/change-password">修改密码</Link> },
                  { key: 'site', label: <Link to="/">返回前台</Link> },
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: doLogout },
                ],
              }}
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: '#dc2626' }} icon={<UserOutlined />} />
                <span style={{ color: token.colorText }}>{admin?.name || admin?.email}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{
          margin: 24,
          padding: 24,
          background: token.colorBgContainer,
          borderRadius: 4,
          boxShadow: 'var(--shadowSm)',
        }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
