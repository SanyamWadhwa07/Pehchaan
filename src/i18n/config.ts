import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

export const SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export const i18nResources = {
  en: { translation: en },
  hi: { translation: hi },
} as const;
