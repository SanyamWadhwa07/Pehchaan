import {useShallow} from 'zustand/react/shallow';
import type {Session} from '@supabase/supabase-js';

import {useAuthStore} from '@/stores/authStore';

export function useAuth(): {
  session: Session | null;
  loading: boolean;
} {
  return useAuthStore(
    useShallow(s => ({
      session: s.session,
      loading: s.loading,
    })),
  );
}
