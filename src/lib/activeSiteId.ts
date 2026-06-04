import type {Session} from '@supabase/supabase-js';

import {DEV_TEST_SITE_ID} from '@/constants/dev';

/** Site scope for recognition + site-package hydration (dev fallback when JWT has no site_id). */
export function resolveActiveSiteId(session: Session | null): string {
  const fromMeta = session?.user?.app_metadata?.site_id;
  if (typeof fromMeta === 'string' && fromMeta.trim().length > 0) {
    return fromMeta.trim();
  }
  return DEV_TEST_SITE_ID;
}
