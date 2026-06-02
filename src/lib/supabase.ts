import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { supabaseEnv } from '@/config/env';

/**
 * Single Supabase client for the app. Sessions persist in AsyncStorage.
 * After sign-in, `auth.uid()` in RLS matches the JWT `sub` claim.
 *
 * Supervisor rows: link `public.sites.supervisor_id` to this user's id
 * (see supabase/README.md). No `app_metadata` required for site-scoped reads.
 *
 * Device / admin: set `app_metadata.pehchaan_role` (+ `site_id` for devices)
 * via Dashboard or a Custom Access Token Hook — see supabase/README.md.
 */
export const supabase = createClient(supabaseEnv.url, supabaseEnv.anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
