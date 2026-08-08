import { useState } from 'react';
import { Alert, Avatar, Button, Drawer, Dropdown, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/auth';
import LanguageSwitcher from '../LanguageSwitcher';
import LevelSwitcher from '../LevelSwitcher';
import FeedbackWidget from '../FeedbackWidget';
import MaterialIcon from '../MaterialIcon';

const planColor: Record<string, string> = {
  FREE: 'default',
  STANDARD: 'blue',
  AI: 'purple',
  AI_UNLIMITED: 'gold',
};

/** Shell A — marketing/auth pages: fixed translucent top bar, no sidebar. */
export default function MarketingLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayPlan = user?.effectivePlan || user?.plan;
  const trialActive = Boolean(user?.trial?.active);
  const trialDaysLeft = user?.trial?.daysLeft ?? 0;
  const trialPlanLabel = user?.trial?.plan ? t(`plan.${user.trial.plan}`) : '';

  const go = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const userMenu = {
    items: [
      { key: 'dashboard', label: t('nav.dashboard'), onClick: () => navigate('/dashboard') },
      { key: 'orders', label: t('nav.orders'), onClick: () => navigate('/orders') },
      { key: 'changePassword', label: t('nav.changePassword'), onClick: () => navigate('/change-password') },
      { key: 'logout', label: t('nav.logout'), onClick: () => { logout(); navigate('/'); } },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-md shadow-sm">
        <div className="max-w-container mx-auto h-20 px-4 md:px-8 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-on-surface shrink-0">
            🇫🇷 {t('app.name')}
          </Link>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-3">
            <LevelSwitcher />
            <LanguageSwitcher />
            {user ? (
              <>
                <Tag color={planColor[displayPlan || 'FREE']}>{t(`plan.${displayPlan || 'FREE'}`)}</Tag>
                <Dropdown menu={userMenu}>
                  <div className="flex items-center gap-2 cursor-pointer text-on-surface">
                    <Avatar icon={<UserOutlined />} />
                    <span className="max-w-[160px] truncate">{user.name || user.email}</span>
                  </div>
                </Dropdown>
              </>
            ) : (
              <>
                <Button onClick={() => navigate('/login')}>{t('nav.login')}</Button>
                <Button type="primary" onClick={() => navigate('/register')}>{t('nav.register')}</Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label="menu"
            className="md:hidden p-2 text-on-surface"
            onClick={() => setDrawerOpen(true)}
          >
            <MaterialIcon name="menu" size={24} />
          </button>
        </div>
      </header>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={280}
        title={(
          <div className="flex items-center justify-between gap-2">
            <LevelSwitcher />
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
          <div className="flex items-center gap-2 pb-3 text-on-surface">
            <Avatar icon={<UserOutlined />} />
            <span className="truncate">{user.name || user.email}</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {user ? (
            <>
              <Button block onClick={() => go('/dashboard')}>{t('nav.dashboard')}</Button>
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
        <div className="pt-24 px-4 md:px-8 max-w-container mx-auto w-full -mb-16">
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

      <main className="flex-1 pt-24 pb-12 px-4 md:px-8 max-w-container mx-auto w-full">
        <Outlet />
      </main>

      <footer className="bg-surface-container-lowest border-t border-outline-variant/40">
        <div className="max-w-container mx-auto px-4 md:px-8 py-8 text-center text-sm text-on-surface-variant">
          {t('app.footer', { year: new Date().getFullYear() })}
        </div>
      </footer>
      <FeedbackWidget />
    </div>
  );
}
