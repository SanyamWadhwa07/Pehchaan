import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useTranslation} from 'react-i18next';

import {AuthResultScreen} from '@/screens/auth/AuthResultScreen';
import {LivenessChallengeScreen} from '@/screens/auth/LivenessChallengeScreen';
import {QualityCheckScreen} from '@/screens/auth/QualityCheckScreen';
import {RecognitionScreen} from '@/screens/auth/RecognitionScreen';
import {WelcomeScreen} from '@/screens/auth/WelcomeScreen';
import {LanguageSettingsScreen} from '@/screens/settings/LanguageSettingsScreen';
import {colors} from '@/theme/colors';
import type {LivenessSession, RecognitionResult} from '@/types';

export type AuthStackParamList = {
  Welcome: undefined;
  QualityCheck: undefined;
  Recognition: undefined;
  Liveness: {recognition: RecognitionResult};
  AuthResult: {
    recognition: RecognitionResult;
    livenessSession: LivenessSession;
  };
  Settings: undefined;
};

const Stack = createStackNavigator<AuthStackParamList>();

export function AuthStack(): React.JSX.Element {
  const {t} = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerStyle: {backgroundColor: colors.surface},
        headerTintColor: colors.primary,
        headerTitleStyle: {color: colors.text, fontWeight: '600'},
        headerShadowVisible: true,
      }}>
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="QualityCheck"
        component={QualityCheckScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="Recognition"
        component={RecognitionScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="Liveness"
        component={LivenessChallengeScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="AuthResult"
        component={AuthResultScreen}
        options={{title: t('authResult.success'), headerShown: true}}
      />
      <Stack.Screen
        name="Settings"
        component={LanguageSettingsScreen}
        options={{title: t('settings.title')}}
      />
    </Stack.Navigator>
  );
}
