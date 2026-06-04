import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useTranslation} from 'react-i18next';

import {SupervisorConfirmationScreen} from '@/screens/supervisor/SupervisorConfirmationScreen';
import {SupervisorHomeScreen} from '@/screens/supervisor/SupervisorHomeScreen';
import {colors} from '@/theme/colors';

export type SupervisorStackParamList = {
  SupervisorHome: undefined;
  SupervisorConfirmation: undefined;
};

const Stack = createStackNavigator<SupervisorStackParamList>();

export function SupervisorStack(): React.JSX.Element {
  const {t} = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName="SupervisorHome"
      screenOptions={{
        headerStyle: {backgroundColor: colors.surface},
        headerTintColor: colors.primary,
        headerTitleStyle: {color: colors.text, fontWeight: '600'},
        headerShadowVisible: true,
      }}>
      <Stack.Screen
        name="SupervisorHome"
        component={SupervisorHomeScreen}
        options={{title: t('supervisorDashboard.title')}}
      />
      <Stack.Screen
        name="SupervisorConfirmation"
        component={SupervisorConfirmationScreen}
        options={{
          title: t('supervisorConfirmation.title'),
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}
