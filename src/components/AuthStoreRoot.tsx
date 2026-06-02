import React, { useEffect } from 'react';

import { subscribeAuthToStore } from '@/stores/authStore';

/** Mount once so Supabase session hydrates into Zustand before navigation gates. */
export function AuthStoreRoot({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  useEffect(() => {
    subscribeAuthToStore();
  }, []);

  return <>{children}</>;
}
