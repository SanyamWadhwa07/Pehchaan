import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthStack } from '@/navigation/AuthStack';
import { initI18n, type AppLanguage } from '@/i18n';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { colors } from '@/theme/colors';

const APP_LANGUAGE_KEY = 'app_language';

async function readStoredLanguage(): Promise<AppLanguage | undefined> {
  const stored = await AsyncStorage.getItem(APP_LANGUAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored as AppLanguage)) {
    return stored as AppLanguage;
  }
  return undefined;
}

export default function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const language = await readStoredLanguage();
      await initI18n(language);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthStack />
      </NavigationContainer>
    </SafeAreaProvider>
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
