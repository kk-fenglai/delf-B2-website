import { useCallback } from 'react';
import { Tabs, Typography, Grid } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Overview from './payments/Overview';
import Catalog from './payments/Catalog';
import Orders from './payments/Orders';
import Contracts from './payments/Contracts';
import PricingReview from './payments/PricingReview';

const { Title } = Typography;
const { useBreakpoint } = Grid;

const VALID_TABS = ['overview', 'catalog', 'pricingReview', 'orders', 'contracts'] as const;
type TabKey = (typeof VALID_TABS)[number];

function isValidTab(v: string | null): v is TabKey {
  return !!v && (VALID_TABS as readonly string[]).includes(v);
}

export default function AdminPayments() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const rawTab = searchParams.get('tab');
  const activeTab: TabKey = isValidTab(rawTab) ? rawTab : 'overview';

  const setTab = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(searchParams);
      sp.set('tab', next);
      // Drop cross-tab leftovers — different tabs use different filters and
      // sharing a URL with stale params is more confusing than helpful.
      ['q', 'status', 'provider', 'page', 'pageSize'].forEach((k) => sp.delete(k));
      setSearchParams(sp, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div>
      <Title level={isMobile ? 4 : 3} style={{ marginBottom: 16 }}>
        {t('adminPayments.title')}
      </Title>

      <Tabs
        activeKey={activeTab}
        onChange={setTab}
        destroyInactiveTabPane
        size={isMobile ? 'small' : 'middle'}
        tabBarGutter={isMobile ? 4 : 8}
        items={[
          {
            key: 'overview',
            label: t('adminPayments.tabs.overview'),
            children: <Overview onJumpContracts={() => setTab('contracts')} />,
          },
          {
            key: 'catalog',
            label: t('adminPayments.tabs.catalog'),
            children: <Catalog />,
          },
          {
            key: 'pricingReview',
            label: t('adminPayments.tabs.pricingReview'),
            children: <PricingReview />,
          },
          {
            key: 'orders',
            label: t('adminPayments.tabs.orders'),
            children: <Orders />,
          },
          {
            key: 'contracts',
            label: t('adminPayments.tabs.contracts'),
            children: <Contracts />,
          },
        ]}
      />
    </div>
  );
}
