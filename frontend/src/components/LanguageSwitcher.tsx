import { Dropdown, Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.split('-')[0] || 'zh';
  const currentLang = SUPPORTED_LANGS.find((l) => l.code === current) ?? SUPPORTED_LANGS[0];

  const items = SUPPORTED_LANGS.map((lang) => ({
    key: lang.code,
    label: (
      <span>
        {lang.flag} {lang.label}
      </span>
    ),
    onClick: () => i18n.changeLanguage(lang.code),
  }));

  return (
    <Dropdown menu={{ items, selectedKeys: [current] }} placement="bottomRight">
      <Button type="text" icon={<GlobalOutlined />} style={{ color: 'white' }}>
        {currentLang.flag} {currentLang.label}
      </Button>
    </Dropdown>
  );
}
