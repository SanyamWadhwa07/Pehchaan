import {useEffect, useRef} from 'react';

import {isSitePackageDecryptionConfigured} from '@/config/env';
import {resolveActiveSiteId} from '@/lib/activeSiteId';
import {hydrateLocalWorkersFromSitePackage} from '@/services/sitePackage/hydrateLocalWorkers';
import {useAuthStore} from '@/stores/authStore';

/**
 * Once per app session: download + decrypt site package into WatermelonDB workers
 * (embeddings for offline recognition). No-op when master key or site package missing.
 */
export function useSitePackageHydration(): void {
  const session = useAuthStore(s => s.session);
  const role = session?.user?.app_metadata?.pehchaan_role as string | undefined;
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) {
      return;
    }
    if (!session) {
      return;
    }
    if (role !== 'device' && role !== 'supervisor') {
      return;
    }
    if (!isSitePackageDecryptionConfigured()) {
      if (__DEV__) {
        console.warn(
          '[hydrate] SITE_PACKAGE_MASTER_KEY not set — skipping site package download',
        );
      }
      return;
    }

    attemptedRef.current = true;
    const siteId = resolveActiveSiteId(session);

    void hydrateLocalWorkersFromSitePackage({siteId})
      .then(r => {
        if (__DEV__) {
          console.log(
            `[hydrate] ${r.workerCount} workers (${r.packageKind}) for site ${siteId}`,
          );
        }
      })
      .catch(err => {
        if (__DEV__) {
          console.warn('[hydrate] site package failed:', err);
        }
      });
  }, [session, role]);
}
