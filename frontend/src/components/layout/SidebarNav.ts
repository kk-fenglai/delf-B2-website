// Home link carries ?home=1 so RootGate doesn't bounce authed users back to /dashboard.
export const HOME_LINK = '/?home=1';

export interface NavItem {
  to: string;
  icon: string;
  labelKey: string;
}

export const SIDEBAR_NAV: NavItem[] = [
  { to: HOME_LINK, icon: 'home', labelKey: 'nav.home' },
  { to: '/dashboard', icon: 'dashboard', labelKey: 'nav.dashboard' },
  { to: '/practice', icon: 'edit_note', labelKey: 'nav.practice' },
  { to: '/mistakes', icon: 'menu_book', labelKey: 'nav.mistakes' },
  { to: '/my-exams', icon: 'inventory_2', labelKey: 'nav.myExams' },
  { to: '/exam-guide', icon: 'school', labelKey: 'nav.examGuide' },
  { to: '/pricing', icon: 'payments', labelKey: 'nav.pricing' },
  { to: '/orders', icon: 'shopping_bag', labelKey: 'nav.orders' },
];

// Bottom mobile nav shows a compact subset of the sidebar. Looked up by path so
// reordering SIDEBAR_NAV can't silently swap which items appear here.
export const MOBILE_NAV: NavItem[] = ['/dashboard', '/practice', '/mistakes', '/my-exams', '/orders']
  .map((to) => SIDEBAR_NAV.find((item) => item.to === to))
  .filter((item): item is NavItem => Boolean(item));

export function isNavActive(pathname: string, to: string): boolean {
  if (to === HOME_LINK) return false; // marketing homepage is never "active" inside the app shell
  return pathname === to || pathname.startsWith(`${to}/`);
}
