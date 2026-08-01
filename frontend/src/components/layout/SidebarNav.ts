// Home link carries ?home=1 so RootGate doesn't bounce authed users back to /dashboard.
export const HOME_LINK = '/?home=1';

export interface NavItem {
  to: string;
  icon: string;
  labelKey: string;
}

export const SIDEBAR_NAV: NavItem[] = [
  { to: '/dashboard', icon: 'dashboard', labelKey: 'nav.dashboard' },
  { to: HOME_LINK, icon: 'home', labelKey: 'nav.home' },
  { to: '/practice', icon: 'edit_note', labelKey: 'nav.practice' },
  { to: '/mistakes', icon: 'menu_book', labelKey: 'nav.mistakes' },
  { to: '/my-exams', icon: 'inventory_2', labelKey: 'nav.myExams' },
  { to: '/pricing', icon: 'payments', labelKey: 'nav.pricing' },
  { to: '/orders', icon: 'shopping_bag', labelKey: 'nav.orders' },
];

// Bottom mobile nav shows a compact subset of the sidebar.
export const MOBILE_NAV: NavItem[] = [
  SIDEBAR_NAV[0], // dashboard
  SIDEBAR_NAV[2], // practice
  SIDEBAR_NAV[3], // mistakes
  SIDEBAR_NAV[4], // my-exams
  SIDEBAR_NAV[6], // orders
];

export function isNavActive(pathname: string, to: string): boolean {
  if (to === HOME_LINK) return false; // marketing homepage is never "active" inside the app shell
  return pathname === to || pathname.startsWith(`${to}/`);
}
