import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import { AuthStack } from '@/navigation/AuthStack';
import { EnrollmentStack } from '@/navigation/EnrollmentStack';

export type RootParamList = {
  Auth: undefined;
  Enrollment: undefined;
};

const Stack = createStackNavigator<RootParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="Auth"
      screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthStack} />
      <Stack.Screen name="Enrollment" component={EnrollmentStack} />
    </Stack.Navigator>
  );
}
