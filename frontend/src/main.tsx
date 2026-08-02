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
// Self-hosted fonts (avoid Google Fonts CDN for CN availability)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import 'material-symbols/outlined.css';
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
          colorPrimary: '#004ac6',
          // Admin login uses danger (red) buttons; default red was too light.
          colorError: '#ba1a1a',
          colorBgBase: '#f6f8ff',
          colorBgContainer: '#ffffff',
          // Visible control borders — checkboxes, inputs, selects and default
          // buttons were invisible (transparent) and looked like faint white
          // boxes. colorBorderSecondary stays transparent so cards/tables keep
          // the borderless, shadow-separated look.
          colorBorder: '#94a3b8',
          colorBorderSecondary: 'transparent',
          colorTextBase: '#151b2a',
          colorTextSecondary: '#434655',
          borderRadius: 8,
          borderRadiusLG: 16,
          fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
        },
        components: {
          // Make selection controls clearly visible: a deeper unchecked border
          // and a strong filled state when checked/selected.
          Checkbox: { colorBorder: '#64748b' },
          Radio: { colorBorder: '#64748b' },
          Button: { fontWeight: 600 },
          Table: {
            headerBg: '#f1f3ff',
            headerColor: '#434655',
            borderColor: 'rgba(195, 198, 215, 0.3)',
          },
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
