import React, {useEffect} from 'react';

import {useSitePackageHydration} from '@/hooks/useSitePackageHydration';
import {subscribeAuthToStore} from '@/stores/authStore';

function AuthSessionEffects(): null {
  useSitePackageHydration();
  return null;
}

/** Mount once so Supabase session hydrates into Zustand before navigation gates. */
export function AuthStoreRoot({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  useEffect(() => {
    subscribeAuthToStore();
  }, []);

  return (
    <>
      <AuthSessionEffects />
      {children}
    </>
  );
}
