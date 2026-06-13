import { useState } from 'react';
import { Layout, Menu, Button, Dropdown, Avatar, Tag, theme as antdTheme, Alert, Drawer, Grid } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserOutlined, MenuOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import LanguageSwitcher from './LanguageSwitcher';

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

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
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayPlan = user?.effectivePlan || user?.plan;
  const trialActive = Boolean(user?.trial?.active);
  const trialDaysLeft = user?.trial?.daysLeft ?? 0;
  const trialPlanLabel = user?.trial?.plan ? t(`plan.${user.trial.plan}`) : '';

  const closeDrawer = () => setDrawerOpen(false);
  const go = (path: string) => { navigate(path); closeDrawer(); };

  const navItems = [
    { key: '/', label: <Link to="/">{t('nav.home')}</Link> },
    { key: '/practice', label: <Link to="/practice">{t('nav.practice')}</Link> },
    { key: '/my-exams', label: <Link to="/my-exams">{t('nav.myExams')}</Link> },
    { key: '/mistakes', label: <Link to="/mistakes">{t('nav.mistakes')}</Link> },
    { key: '/dashboard', label: <Link to="/dashboard">{t('nav.dashboard')}</Link> },
    { key: '/pricing', label: <Link to="/pricing">{t('nav.pricing')}</Link> },
    ...(user ? [{ key: '/orders', label: <Link to="/orders">{t('nav.orders')}</Link> }] : []),
  ];

  const userMenu = {
    items: [
      { key: 'dashboard', label: t('nav.dashboard'), onClick: () => navigate('/dashboard') },
      { key: 'orders', label: t('nav.orders'), onClick: () => navigate('/orders') },
      { key: 'changePassword', label: t('nav.changePassword'), onClick: () => navigate('/change-password') },
      { key: 'logout', label: t('nav.logout'), onClick: () => { logout(); navigate('/'); } },
    ],
  };

  return (
    <Layout className="min-h-screen" style={{ background: token.colorBgBase }}>
      <Header
        className="flex items-center px-4 md:px-6"
        style={{
          background: token.colorBgContainer,
        }}
      >
        <div className="font-bold text-lg flex-1 md:flex-none md:mr-8 truncate" style={{ color: token.colorText }}>
          <Link to="/" style={{ color: 'inherit' }}>
            🇫🇷 {t('app.name')}
          </Link>
        </div>

        {isMobile ? (
          <Button
            type="text"
            aria-label="menu"
            icon={<MenuOutlined style={{ fontSize: 20 }} />}
            onClick={() => setDrawerOpen(true)}
            style={{ color: token.colorText }}
          />
        ) : (
          <>
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
                <Tag color={planColor[displayPlan || 'FREE']}>{t(`plan.${displayPlan || 'FREE'}`)}</Tag>
                <Dropdown menu={userMenu}>
                  <div className="flex items-center gap-2 cursor-pointer" style={{ color: token.colorText }}>
                    <Avatar icon={<UserOutlined />} />
                    <span>{user.name || user.email}</span>
                  </div>
                </Dropdown>
              </div>
            ) : (
              <div className="flex gap-2 ml-3">
                <Button onClick={() => navigate('/login')}>{t('nav.login')}</Button>
                <Button type="primary" onClick={() => navigate('/register')}>{t('nav.register')}</Button>
              </div>
            )}
          </>
        )}
      </Header>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        placement="right"
        width={280}
        styles={{ body: { padding: 0 } }}
        title={(
          <div className="flex items-center justify-between">
            <LanguageSwitcher />
            {user && (
              <Tag color={planColor[displayPlan || 'FREE']} style={{ marginInlineEnd: 0 }}>
                {t(`plan.${displayPlan || 'FREE'}`)}
              </Tag>
            )}
          </div>
        )}
      >
        {user && (
          <div className="flex items-center gap-2 px-4 py-3" style={{ color: token.colorText }}>
            <Avatar icon={<UserOutlined />} />
            <span className="truncate">{user.name || user.email}</span>
          </div>
        )}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={navItems}
          style={{ borderInlineEnd: 'none' }}
          onClick={closeDrawer}
        />
        <div className="flex flex-col gap-2 p-4">
          {user ? (
            <>
              <Button block onClick={() => go('/change-password')}>{t('nav.changePassword')}</Button>
              <Button block danger onClick={() => { logout(); go('/'); }}>{t('nav.logout')}</Button>
            </>
          ) : (
            <>
              <Button block onClick={() => go('/login')}>{t('nav.login')}</Button>
              <Button block type="primary" onClick={() => go('/register')}>{t('nav.register')}</Button>
            </>
          )}
        </div>
      </Drawer>

      {trialActive && (
        <div className="px-4 md:px-6 pt-3">
          <Alert
            type="info"
            showIcon
            banner
            message={t('pricing.trial.topBar', { days: trialDaysLeft, plan: trialPlanLabel })}
            action={(
              <Button size="small" type="primary" ghost onClick={() => navigate('/pricing')}>
                {t('pricing.trial.subscribeNow')}
              </Button>
            )}
          />
        </div>
      )}
      <Content className="p-4 md:p-6" style={{ backgroundColor: token.colorBgBase }}>
        <Outlet />
      </Content>
      <Footer className="text-center text-gray-500">
        {t('app.footer', { year: new Date().getFullYear() })}
      </Footer>
    </Layout>
  );
}
