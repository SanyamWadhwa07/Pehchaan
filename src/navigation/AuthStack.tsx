import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';

import { QualityCheckScreen } from '@/screens/auth/QualityCheckScreen';
import { LanguageSettingsScreen } from '@/screens/settings/LanguageSettingsScreen';
import { colors } from '@/theme/colors';

export type AuthStackParamList = {
  QualityCheck: undefined;
  Settings: undefined;
};

const Stack = createStackNavigator<AuthStackParamList>();

export function AuthStack(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName="QualityCheck"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
      }}>
      <Stack.Screen
        name="QualityCheck"
        component={QualityCheckScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={LanguageSettingsScreen}
        options={{ title: t('settings.title') }}
      />
    </Stack.Navigator>
  );
}
