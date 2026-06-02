import React from 'react';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigation } from '@/AppNavigation';
import { AuthStoreRoot } from '@/components/AuthStoreRoot';
import { database } from '@/db';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <DatabaseProvider database={database}>
        <AuthStoreRoot>
          <AppNavigation />
        </AuthStoreRoot>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
