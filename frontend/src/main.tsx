import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import frFR from 'antd/locale/fr_FR';
import { useTranslation } from 'react-i18next';
import App from './App';
import { apiOrigin } from './api/baseUrl';
import './i18n';
import './styles/index.css';

const apiOriginUrl = apiOrigin();
if (apiOriginUrl) {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = apiOriginUrl;
  document.head.appendChild(link);
}

const antdLocaleMap = { zh: zhCN, en: enUS, fr: frFR };

function AppWithLocale() {
  const { i18n } = useTranslation();
  const lang = (i18n.language?.split('-')[0] || 'zh') as keyof typeof antdLocaleMap;
  const locale = antdLocaleMap[lang] || zhCN;
  document.documentElement.lang = lang;

  return (
    <StyleProvider hashPriority="high">
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1d4ed8',
          // Admin login uses danger (red) buttons; default red was too light.
          colorError: '#dc2626',
          colorBgBase: '#f6f8ff',
          colorBgContainer: '#ffffff',
          // Visible control borders — checkboxes, inputs, selects and default
          // buttons were invisible (transparent) and looked like faint white
          // boxes. colorBorderSecondary stays transparent so cards/tables keep
          // the borderless, shadow-separated look.
          colorBorder: '#94a3b8',
          colorBorderSecondary: 'transparent',
          colorTextBase: '#0b1220',
          colorTextSecondary: 'rgba(11, 18, 32, 0.62)',
          borderRadius: 12,
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
        },
        components: {
          // Make selection controls clearly visible: a deeper unchecked border
          // and a strong filled state when checked/selected.
          Checkbox: { colorBorder: '#64748b' },
          Radio: { colorBorder: '#64748b' },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
    </StyleProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithLocale />
  </React.StrictMode>
);
