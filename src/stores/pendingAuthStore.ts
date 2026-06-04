import {create} from 'zustand';

import type {PendingAuthSession, PendingAuthStatus} from '@/types';

type PendingAuthState = {
  session: PendingAuthSession | null;
  setSession: (session: PendingAuthSession) => void;
  setStatus: (status: PendingAuthStatus) => void;
  clear: () => void;
};

export const usePendingAuthStore = create<PendingAuthState>(set => ({
  session: null,
  setSession: session => set({session}),
  setStatus: status =>
    set(s => (s.session ? {session: {...s.session, status}} : {session: null})),
  clear: () => set({session: null}),
}));
