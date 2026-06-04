import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import { AuthStack } from '@/navigation/AuthStack';
import { EnrollmentStack } from '@/navigation/EnrollmentStack';
import { RegistrationStack } from '@/navigation/RegistrationStack';
import { SupervisorStack } from '@/navigation/SupervisorStack';
import { useAuthStore } from '@/stores/authStore';

export type RootParamList = {
  Supervisor: undefined;
  Auth: undefined;
  Enrollment: undefined;
  Registration: undefined;
};

const Stack = createStackNavigator<RootParamList>();

export function RootNavigator(): React.JSX.Element {
  const role = useAuthStore(
    (s) => s.session?.user?.app_metadata?.pehchaan_role as string | undefined,
  );
  const isSupervisor = role === 'supervisor';

  return (
    <Stack.Navigator
      initialRouteName={isSupervisor ? 'Supervisor' : 'Auth'}
      screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Supervisor" component={SupervisorStack} />
      <Stack.Screen name="Auth" component={AuthStack} />
      <Stack.Screen name="Enrollment" component={EnrollmentStack} />
      <Stack.Screen name="Registration" component={RegistrationStack} />
    </Stack.Navigator>
  );
}
