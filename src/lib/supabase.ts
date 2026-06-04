import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';

import {supabaseEnv} from '@/config/env';

const CONFIG_HINT =
  'Add .env at the project root (same folder as package.json), then rebuild: cd android && ./gradlew clean && cd .. && npm run android';

function createSupabaseClient(): SupabaseClient | null {
  const {url, anonKey} = supabaseEnv;
  if (!url?.trim() || !anonKey?.trim()) {
    return null;
  }
  try {
    return createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (err) {
    if (__DEV__) {
      console.warn('[supabase] createClient failed:', err);
    }
    return null;
  }
}

/**
 * Single Supabase client for the app. Sessions persist in AsyncStorage.
 * Null until native app is rebuilt with react-native-config + a valid `.env`.
 */
export const supabase = createSupabaseClient();

/** Use in services that require Supabase; throws a clear setup error when not configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(`Supabase is not configured. ${CONFIG_HINT}`);
  }
  return supabase;
}

if (__DEV__ && !supabase) {
  console.warn(`[supabase] Missing env vars. ${CONFIG_HINT}`);
}
