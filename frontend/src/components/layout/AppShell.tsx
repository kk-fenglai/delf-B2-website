import { Alert, Avatar, Button, Dropdown, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/auth';
import LanguageSwitcher from '../LanguageSwitcher';
import FeedbackWidget from '../FeedbackWidget';
import AnnouncementModal from '../AnnouncementModal';
import MaterialIcon from '../MaterialIcon';
import { SIDEBAR_NAV, MOBILE_NAV, isNavActive } from './SidebarNav';

const planColor: Record<string, string> = {
  FREE: 'default',
  STANDARD: 'blue',
  AI: 'purple',
  AI_UNLIMITED: 'gold',
};

/** Shell B — logged-in app: fixed w-64 sidebar, sticky top bar, mobile bottom nav. */
export default function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const displayPlan = user?.effectivePlan || user?.plan;
  const trialActive = Boolean(user?.trial?.active);
  const trialDaysLeft = user?.trial?.daysLeft ?? 0;
  const trialPlanLabel = user?.trial?.plan ? t(`plan.${user.trial.plan}`) : '';

  const userMenu = {
    items: [
      { key: 'dashboard', label: t('nav.dashboard'), onClick: () => navigate('/dashboard') },
      { key: 'orders', label: t('nav.orders'), onClick: () => navigate('/orders') },
      { key: 'changePassword', label: t('nav.changePassword'), onClick: () => navigate('/change-password') },
      { key: 'logout', label: t('nav.logout'), onClick: () => { logout(); navigate('/'); } },
    ],
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 z-40 flex-col bg-surface-bright shadow-level-1">
        <Link to="/dashboard" className="flex items-center gap-2 h-20 px-6 text-lg font-bold text-on-surface shrink-0">
          🇫🇷 {t('app.name')}
        </Link>
        <nav className="flex-1 overflow-y-auto py-2">
          {SIDEBAR_NAV.map((item) => {
            const active = isNavActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  active
                    ? 'text-primary font-bold border-l-4 border-primary bg-primary-container/10'
                    : 'text-on-surface-variant border-l-4 border-transparent hover:text-on-surface hover:bg-surface-container-low'
                }`}
              >
                <MaterialIcon name={item.icon} size={20} fill={active} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-outline-variant/40 space-y-3">
          <Button type="primary" block size="large" onClick={() => navigate('/practice')}>
            {t('shell.startPractice')}
          </Button>
          <Dropdown menu={userMenu}>
            <div className="flex items-center gap-2 cursor-pointer text-on-surface px-1">
              <Avatar icon={<UserOutlined />} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{user?.name || user?.email}</div>
                <div className="text-xs text-on-surface-variant">{t(`plan.${displayPlan || 'FREE'}`)}</div>
              </div>
            </div>
          </Dropdown>
        </div>
      </aside>

      <div className="md:ml-64 flex flex-col min-h-screen">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md shadow-sm">
          <div className="h-16 md:h-20 px-4 md:px-8 flex items-center justify-between md:justify-end gap-3">
            <Link to="/dashboard" className="md:hidden flex items-center gap-1 font-bold text-on-surface truncate">
              🇫🇷 {t('app.name')}
            </Link>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Tag className="hidden sm:inline-block" color={planColor[displayPlan || 'FREE']} style={{ marginInlineEnd: 0 }}>
                {t(`plan.${displayPlan || 'FREE'}`)}
              </Tag>
              <Dropdown menu={userMenu}>
                <Avatar className="cursor-pointer shrink-0" icon={<UserOutlined />} />
              </Dropdown>
            </div>
          </div>
        </header>

        {trialActive && (
          <div className="px-4 md:px-8 pt-3">
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

        <main className="flex-1 p-4 md:p-8 max-w-container mx-auto w-full pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-container-lowest border-t border-outline-variant/40 flex">
        {MOBILE_NAV.map((item) => {
          const active = isNavActive(location.pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? 'text-primary font-semibold' : 'text-on-surface-variant'
              }`}
            >
              <MaterialIcon name={item.icon} size={22} fill={active} />
              <span className="truncate max-w-full px-1">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
      <FeedbackWidget />
      <AnnouncementModal />
    </div>
  );
}
