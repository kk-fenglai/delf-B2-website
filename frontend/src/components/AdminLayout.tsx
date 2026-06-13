import { useState } from 'react';
import {
  Layout, Menu, Dropdown, Avatar, Tag, Space, Typography, theme as antdTheme,
  Button, Drawer, Grid,
} from 'antd';
import {
  DashboardOutlined, UserOutlined, FileTextOutlined, LogoutOutlined,
  SafetyCertificateOutlined, HistoryOutlined, BookOutlined, CreditCardOutlined,
  KeyOutlined, MenuOutlined,
} from '@ant-design/icons';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAdminAuth } from '../stores/adminAuth';

const { Header, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

export default function AdminLayout() {
  const { admin, logout, fetchMe } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = antdTheme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!admin && localStorage.getItem('delfluent-admin-access')) {
      fetchMe();
    }
  }, [admin, fetchMe]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  if (!admin && !localStorage.getItem('delfluent-admin-access')) {
    return <Navigate to="/admin/login" replace />;
  }

  const doLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const menu = [
    { key: '/admin/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/admin/users', icon: <UserOutlined />, label: '用户管理' },
    { key: '/admin/exams', icon: <BookOutlined />, label: '套题管理' },
    { key: '/admin/payments', icon: <CreditCardOutlined />, label: '支付管理' },
    { key: '/admin/logs', icon: <FileTextOutlined />, label: '操作审计' },
    { key: '/admin/logins', icon: <HistoryOutlined />, label: '登录历史' },
  ];

  const activeKey = menu.find((m) => location.pathname.startsWith(m.key))?.key || '/admin/dashboard';
  const activeLabel = menu.find((m) => m.key === activeKey)?.label || 'Dashboard';

  const go = (path: string) => {
    navigate(path);
    setNavOpen(false);
  };

  const menuItems = menu.map((m) => ({
    ...m,
    label: isMobile ? m.label : <Link to={m.key}>{m.label}</Link>,
    onClick: isMobile ? () => go(m.key) : undefined,
  }));

  const userDropdownItems = [
    {
      key: 'info',
      disabled: true,
      label: (
        <div>
          <div>{admin?.email}</div>
          <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
            上次登录 {admin?.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '—'}
          </div>
        </div>
      ),
    },
    { type: 'divider' as const },
    { key: 'pwd', icon: <KeyOutlined />, label: <Link to="/admin/change-password">修改密码</Link> },
    { key: 'site', label: <Link to="/">返回前台</Link> },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: doLogout },
  ];

  const navMenu = (
    <Menu
      mode="inline"
      selectedKeys={[activeKey]}
      items={menuItems}
      style={{ background: 'transparent', borderInlineEnd: 'none' }}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgBase }}>
      {!isMobile && (
        <Layout.Sider
          width={220}
          style={{ background: token.colorBgContainer }}
        >
          <div
            className="app-hero-bg"
            style={{
              color: token.colorText,
              padding: 20,
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 0.5,
            }}
          >
            🛡️ DELF Admin
          </div>
          {navMenu}
        </Layout.Sider>
      )}

      <Layout>
        <Header
          className="admin-header"
          style={{
            background: token.colorBgContainer,
            padding: isMobile ? '0 12px' : '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            height: isMobile ? 56 : 64,
            lineHeight: isMobile ? '56px' : '64px',
          }}
        >
          <Space size={8} className="min-w-0">
            {isMobile && (
              <Button
                type="text"
                aria-label="打开菜单"
                icon={<MenuOutlined style={{ fontSize: 18 }} />}
                onClick={() => setNavOpen(true)}
              />
            )}
            <SafetyCertificateOutlined style={{ color: '#dc2626', flexShrink: 0 }} />
            <div className="min-w-0">
              <Text strong style={{ color: token.colorText }} className={isMobile ? 'text-sm' : undefined}>
                {isMobile ? activeLabel : '管理员控制台'}
              </Text>
              {!isMobile && (
                <Tag color={admin?.role === 'SUPER_ADMIN' ? 'red' : 'orange'} style={{ marginInlineStart: 8 }}>
                  {admin?.role || '—'}
                </Tag>
              )}
            </div>
            {isMobile && (
              <Tag color={admin?.role === 'SUPER_ADMIN' ? 'red' : 'orange'} className="!m-0 shrink-0">
                {admin?.role === 'SUPER_ADMIN' ? '超管' : '管理'}
              </Tag>
            )}
          </Space>
          <Dropdown menu={{ items: userDropdownItems }}>
            <Space style={{ cursor: 'pointer' }} className="shrink-0">
              <Avatar size={isMobile ? 'small' : 'default'} style={{ background: '#dc2626' }} icon={<UserOutlined />} />
              {!isMobile && (
                <span style={{ color: token.colorText }}>{admin?.name || admin?.email}</span>
              )}
            </Space>
          </Dropdown>
        </Header>

        <Drawer
          open={navOpen}
          onClose={() => setNavOpen(false)}
          placement="left"
          width={280}
          styles={{ body: { padding: 0 } }}
          title={(
            <span style={{ fontWeight: 800 }}>🛡️ DELF Admin</span>
          )}
        >
          {navMenu}
          <div className="p-4 border-t border-gray-100 flex flex-col gap-2">
            <Button block onClick={() => go('/admin/change-password')}>修改密码</Button>
            <Button block onClick={() => go('/')}>返回前台</Button>
            <Button block danger onClick={doLogout}>退出登录</Button>
          </div>
        </Drawer>

        <Content
          className="admin-content"
          style={{
            margin: isMobile ? 12 : 24,
            padding: isMobile ? 12 : 24,
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
