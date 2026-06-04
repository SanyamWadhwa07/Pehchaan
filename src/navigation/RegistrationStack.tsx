import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';

import { RegistrationProvider } from '@/screens/registration/RegistrationContext';
import { FieldCaptureScreen } from '@/screens/registration/FieldCaptureScreen';
import { RegistrationDetailsScreen } from '@/screens/registration/RegistrationDetailsScreen';
import { RegistrationQueuedScreen } from '@/screens/registration/RegistrationQueuedScreen';
import { colors } from '@/theme/colors';

export type RegistrationStackParamList = {
  RegistrationDetails: undefined;
  FieldCapture: undefined;
  RegistrationQueued: undefined;
};

const Stack = createStackNavigator<RegistrationStackParamList>();

function RegistrationNavigator(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName="RegistrationDetails"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        headerShadowVisible: true,
      }}>
      <Stack.Screen
        name="RegistrationDetails"
        component={RegistrationDetailsScreen}
        options={{ title: t('registration.title') }}
      />
      <Stack.Screen
        name="FieldCapture"
        component={FieldCaptureScreen}
        options={{ title: t('registration.capturePhoto'), headerShown: false }}
      />
      <Stack.Screen
        name="RegistrationQueued"
        component={RegistrationQueuedScreen}
        options={{ title: t('registration.stepConfirm') }}
      />
    </Stack.Navigator>
  );
}

export function RegistrationStack(): React.JSX.Element {
  return (
    <RegistrationProvider>
      <RegistrationNavigator />
    </RegistrationProvider>
  );
}
