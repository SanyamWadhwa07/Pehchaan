import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  setSession: (session) =>
    set({ session, user: session?.user ?? null }),
  setLoading: (loading) => set({ loading }),
}));

let authListenerSubscribed = false;

/**
 * Single Supabase auth subscription → Zustand. Call once near app root.
 */
export function subscribeAuthToStore(): void {
  if (authListenerSubscribed) {
    return;
  }
  authListenerSubscribed = true;

  if (!supabase) {
    useAuthStore.getState().setLoading(false);
    return;
  }

  void supabase.auth.getSession().then(({ data }) => {
    useAuthStore.getState().setSession(data.session ?? null);
    useAuthStore.getState().setLoading(false);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
    useAuthStore.getState().setLoading(false);
  });
}
