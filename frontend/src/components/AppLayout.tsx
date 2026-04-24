import { Layout, Menu, Button, Dropdown, Avatar, Tag, theme as antdTheme } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import LanguageSwitcher from './LanguageSwitcher';

const { Header, Content, Footer } = Layout;

const planColor: Record<string, string> = {
  FREE: 'default',
  STANDARD: 'blue',
  AI: 'purple',
  AI_UNLIMITED: 'gold',
};

export default function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { token } = antdTheme.useToken();

  const navItems = [
    { key: '/', label: <Link to="/">{t('nav.home')}</Link> },
    { key: '/practice', label: <Link to="/practice">{t('nav.practice')}</Link> },
    { key: '/mistakes', label: <Link to="/mistakes">{t('nav.mistakes')}</Link> },
    { key: '/dashboard', label: <Link to="/dashboard">{t('nav.dashboard')}</Link> },
    { key: '/pricing', label: <Link to="/pricing">{t('nav.pricing')}</Link> },
    ...(user ? [{ key: '/orders', label: <Link to="/orders">{t('nav.orders')}</Link> }] : []),
  ];

  const userMenu = {
    items: [
      { key: 'dashboard', label: t('nav.dashboard'), onClick: () => navigate('/dashboard') },
      { key: 'orders', label: t('nav.orders'), onClick: () => navigate('/orders') },
      { key: 'logout', label: t('nav.logout'), onClick: () => { logout(); navigate('/'); } },
    ],
  };

  return (
    <Layout className="min-h-screen" style={{ background: token.colorBgBase }}>
      <Header
        className="flex items-center px-6"
        style={{
          background: token.colorBgContainer,
        }}
      >
        <div className="font-bold text-lg mr-8" style={{ color: token.colorText }}>
          <Link to="/" style={{ color: 'inherit' }}>
            🇫🇷 {t('app.name')}
          </Link>
        </div>
        <Menu
          theme="light"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={navItems}
          style={{ background: 'transparent', flex: 1, borderBottom: 'none' }}
        />
        <LanguageSwitcher />
        {user ? (
          <div className="flex items-center gap-3 ml-3">
            <Tag color={planColor[user.plan]}>{t(`plan.${user.plan}`)}</Tag>
            <Dropdown menu={userMenu}>
              <div className="flex items-center gap-2 cursor-pointer" style={{ color: token.colorText }}>
                <Avatar icon={<UserOutlined />} />
                <span>{user.name || user.email}</span>
              </div>
            </Dropdown>
          </div>
        ) : (
          <div className="flex gap-2 ml-3">
            <Button ghost onClick={() => navigate('/login')}>{t('nav.login')}</Button>
            <Button type="primary" onClick={() => navigate('/register')}>{t('nav.register')}</Button>
          </div>
        )}
      </Header>
      <Content className="p-6" style={{ backgroundColor: token.colorBgBase }}>
        <Outlet />
      </Content>
      <Footer className="text-center text-gray-500">
        {t('app.footer', { year: new Date().getFullYear() })}
      </Footer>
    </Layout>
  );
}
