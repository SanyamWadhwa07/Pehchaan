import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import {LoginScreen} from '@/screens/auth/LoginScreen';
import {colors} from '@/theme/colors';

export type LoginStackParamList = {
  Login: undefined;
};

const Stack = createStackNavigator<LoginStackParamList>();

/** Shown when no Supabase session — supervisor or device (email + password). */
export function LoginStack(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.surface},
        headerTintColor: colors.primary,
        headerTitleStyle: {color: colors.text, fontWeight: '600'},
      }}>
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{title: 'Pehchaan'}}
      />
    </Stack.Navigator>
  );
}
