import { Layout, Menu, Button, Dropdown, Avatar, Tag } from 'antd';
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

  const navItems = [
    { key: '/', label: <Link to="/">{t('nav.home')}</Link> },
    { key: '/practice', label: <Link to="/practice">{t('nav.practice')}</Link> },
    { key: '/dashboard', label: <Link to="/dashboard">{t('nav.dashboard')}</Link> },
    { key: '/pricing', label: <Link to="/pricing">{t('nav.pricing')}</Link> },
  ];

  const userMenu = {
    items: [
      { key: 'dashboard', label: t('nav.dashboard'), onClick: () => navigate('/dashboard') },
      { key: 'logout', label: t('nav.logout'), onClick: () => { logout(); navigate('/'); } },
    ],
  };

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center px-6" style={{ background: '#1A3A5C' }}>
        <div className="text-white font-bold text-lg mr-8">
          <Link to="/" className="text-white hover:text-white">
            🇫🇷 {t('app.name')}
          </Link>
        </div>
        <Menu
          theme="dark"
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
              <div className="flex items-center gap-2 text-white cursor-pointer">
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
      <Content className="p-6">
        <Outlet />
      </Content>
      <Footer className="text-center text-gray-500">
        {t('app.footer', { year: new Date().getFullYear() })}
      </Footer>
    </Layout>
  );
}
