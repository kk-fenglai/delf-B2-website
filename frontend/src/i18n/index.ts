import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zh from './locales/zh.json';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LANGS = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en', 'fr'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'delfluent-lang',
    },
  });

export default i18n;
