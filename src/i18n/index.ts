import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import {
  DEFAULT_LANGUAGE,
  i18nResources,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from '@/i18n/config';

function resolveDeviceLanguage(): AppLanguage {
  const best = RNLocalize.findBestLanguageTag([...SUPPORTED_LANGUAGES]);
  if (best && SUPPORTED_LANGUAGES.includes(best.languageTag as AppLanguage)) {
    return best.languageTag as AppLanguage;
  }
  return DEFAULT_LANGUAGE;
}

let initialized = false;

/** Call once from App.tsx before rendering navigation. */
export async function initI18n(languageOverride?: AppLanguage): Promise<void> {
  if (initialized) {
    return;
  }

  await i18n.use(initReactI18next).init({
    resources: i18nResources,
    lng: languageOverride ?? resolveDeviceLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    // React Native Hermes lacks Intl.PluralRules — v3 plural format avoids the polyfill.
    compatibilityJSON: 'v3',
    interpolation: { escapeValue: false },
  });

  initialized = true;
}

export { i18n };
export type { AppLanguage } from '@/i18n/config';
export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@/i18n/config';
