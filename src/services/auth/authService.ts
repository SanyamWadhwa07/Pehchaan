import {requireSupabase} from '@/lib/supabase';

export async function login(email: string, password: string) {
  return requireSupabase().auth.signInWithPassword({
    email,
    password,
  });
}

export async function logout() {
  return requireSupabase().auth.signOut();
}
