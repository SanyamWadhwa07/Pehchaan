import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { i18n, type AppLanguage } from '@/i18n';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';

const APP_LANGUAGE_KEY = 'app_language';

export function useAppLanguage(): {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
} {
  const [language, setLanguageState] = useState<AppLanguage>(
    () => (i18n.language as AppLanguage) || 'en',
  );

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return;
    }
    await AsyncStorage.setItem(APP_LANGUAGE_KEY, lang);
    await i18n.changeLanguage(lang);
    setLanguageState(lang);
  }, []);

  return { language, setLanguage };
}
