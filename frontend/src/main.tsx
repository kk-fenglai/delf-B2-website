import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import frFR from 'antd/locale/fr_FR';
import { useTranslation } from 'react-i18next';
import App from './App';
import './i18n';
import './styles/index.css';

const antdLocaleMap = { zh: zhCN, en: enUS, fr: frFR };

function AppWithLocale() {
  const { i18n } = useTranslation();
  const lang = (i18n.language?.split('-')[0] || 'zh') as keyof typeof antdLocaleMap;
  const locale = antdLocaleMap[lang] || zhCN;
  document.documentElement.lang = lang;

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        token: {
          colorPrimary: '#1A3A5C',
          borderRadius: 8,
          fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithLocale />
  </React.StrictMode>
);
