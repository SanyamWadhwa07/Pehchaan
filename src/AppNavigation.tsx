import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/hooks/useAuth';
import { initI18n, type AppLanguage } from '@/i18n';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { LoginStack } from '@/navigation/LoginStack';
import { RootNavigator } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

const APP_LANGUAGE_KEY = 'app_language';

async function readStoredLanguage(): Promise<AppLanguage | undefined> {
  const stored = await AsyncStorage.getItem(APP_LANGUAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored as AppLanguage)) {
    return stored as AppLanguage;
  }
  return undefined;
}

/**
 * i18n boot, then Supabase session — show login until authenticated.
 */
export function AppNavigation(): React.JSX.Element {
  const [i18nReady, setI18nReady] = useState(false);
  const { session, loading: authLoading } = useAuth();

  useEffect(() => {
    void (async () => {
      const language = await readStoredLanguage();
      await initI18n(language);
      setI18nReady(true);
    })();
  }, []);

  const booting = !i18nReady || authLoading;

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer key={session?.user?.id ?? 'signed-out'}>
      {session ? <RootNavigator /> : <LoginStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
