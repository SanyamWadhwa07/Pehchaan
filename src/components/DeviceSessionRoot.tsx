import React from 'react';

import {database} from '@/db';
import {useAuthStore} from '@/stores/authStore';
import {useSyncScheduler} from '@/services/sync';

/**
 * Thin wrapper rendered only while a **device-role** session is active.
 *
 * Responsibilities:
 *   - Mounts `useSyncScheduler` — starts attendance + registration outbox sync
 *     on app foreground and on a 5-minute background timer.
 *   - Cleanup (clearInterval + AppState unsubscribe) runs automatically when
 *     the component unmounts (sign-out or session expiry).
 *
 * Mount point: wrap your device home / session root inside `<DeviceSessionRoot>`.
 * The component is a no-op (just renders children) when the session is not a device role.
 *
 * Usage:
 * ```tsx
 * // In RootNavigator or a device-specific stack:
 * <DeviceSessionRoot>
 *   <DeviceHomeScreen />
 * </DeviceSessionRoot>
 * ```
 */

type Props = {children: React.ReactNode};

function DeviceSyncMount({children}: Props): React.JSX.Element {
  const {runSync} = useSyncScheduler({
    database,
    intervalMs: 5 * 60_000,
    onSyncComplete: r => {
      if (__DEV__) {
        console.log(
          '[sync] attendance uploaded:',
          r.attendance.uploaded,
          'deadLettered:',
          r.attendance.deadLettered,
          'registration uploaded:',
          r.registration.uploaded,
          'deadLettered:',
          r.registration.deadLettered,
        );
        if (r.attendance.errors.length || r.registration.errors.length) {
          console.warn('[sync] errors:', [
            ...r.attendance.errors,
            ...r.registration.errors,
          ]);
        }
      }
    },
    onError: err => {
      if (__DEV__) {
        console.error('[sync] scheduler error:', err);
      }
    },
  });

  // Expose runSync via React context if other components need imperative sync.
  // For now children are rendered directly; add a context provider here when needed.
  void runSync; // prevent unused-var lint warning

  return <>{children}</>;
}

export function DeviceSessionRoot({children}: Props): React.JSX.Element {
  const session = useAuthStore(s => s.session);
  const role = session?.user?.app_metadata?.pehchaan_role as string | undefined;

  if (role !== 'device') {
    // Not a device session — render children without mounting sync.
    return <>{children}</>;
  }

  return <DeviceSyncMount>{children}</DeviceSyncMount>;
}
