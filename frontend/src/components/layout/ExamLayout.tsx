import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MaterialIcon from '../MaterialIcon';

// Map exam route prefixes to skill label keys + the list page to return to.
const SKILL_BY_PREFIX: Array<{ prefix: string; labelKey: string; back: string }> = [
  { prefix: '/practice/listening/', labelKey: 'skill.CO', back: '/practice/listening' },
  { prefix: '/practice/reading/', labelKey: 'skill.CE', back: '/practice/reading' },
  { prefix: '/practice/writing/', labelKey: 'skill.PE', back: '/practice/writing' },
  { prefix: '/practice/speaking/', labelKey: 'skill.PO', back: '/practice/speaking' },
  { prefix: '/practice/mock/', labelKey: 'practice.hub.mockTitle', back: '/practice/mock' },
];

/** Shell C — exam-taking pages: minimal fixed top bar, no sidebar, no footer. */
export default function ExamLayout() {
  const { t } = useTranslation();
  const location = useLocation();

  const match = SKILL_BY_PREFIX.find((s) => location.pathname.startsWith(s.prefix));
  const backTo = match?.back ?? '/practice';

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-md shadow-sm">
        <div className="max-w-container mx-auto h-20 px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" className="flex items-center gap-2 text-lg font-bold text-on-surface shrink-0">
              🇫🇷 {t('app.name')}
            </Link>
            {match && (
              <span className="hidden sm:inline-block text-label-caps uppercase text-on-surface-variant border-l border-outline-variant pl-3 truncate">
                {t(match.labelKey)}
              </span>
            )}
          </div>
          <Link
            to={backTo}
            className="flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary shrink-0"
          >
            <MaterialIcon name="logout" size={18} />
            <span className="hidden sm:inline">{t('shell.exitExam')}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 pt-24 pb-12 px-4 md:px-8 max-w-container mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
