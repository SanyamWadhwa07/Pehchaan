import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigation } from '@/AppNavigation';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppNavigation />
    </SafeAreaProvider>
  );
}
