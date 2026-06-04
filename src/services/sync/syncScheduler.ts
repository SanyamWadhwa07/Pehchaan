import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { Database } from '@nozbe/watermelondb';
import Config from 'react-native-config';
import NetInfo from '@react-native-community/netinfo';

import { reconcileAttendanceFromServer } from '@/services/sync/attendanceRemoteReconcile';
import { pushPendingAttendanceOutbox } from '@/services/sync/attendanceOutboxSync';
import { pushPendingRegistrationOutbox } from '@/services/sync/registrationOutboxSync';
import { syncRevocationsFromServer } from '@/services/sync/revocationRemoteSync';
import { attendancePurgePolicyFromEnv } from '@/services/sync/syncStatusMap';

export type SyncResult = {
  attendance: { uploaded: number; errors: string[]; deadLettered: number };
  registration: { uploaded: number; errors: string[]; deadLettered: number };
  /** Present when `siteId` was configured — revocation pull + WMDB worker updates. */
  revocations?: { applied: number; errors: string[] };
  /** Present when `siteId` was configured — server ↔ local mirror for already-uploaded rows. */
  reconcileAttendance?: { updated: number; errors: string[] };
};

export type SyncSchedulerConfig = {
  database: Database;
  /**
   * Device site UUID (`app_metadata.site_id`). When set, after each push cycle the scheduler
   * runs `reconcileAttendanceFromServer` so integration / supervisor edits propagate locally.
   */
  siteId?: string;
  /**
   * `devices.id` for this terminal (e.g. `app_metadata.device_id`). Used for revocation sync
   * `since` default + optional `devices.last_sync_at` bump on the Edge function.
   */
  deviceId?: string;
  /**
   * How often to poll in the background (ms).
   * Default: 5 minutes. Pass 0 to disable the timer (foreground-trigger only).
   */
  intervalMs?: number;
  /** Called after each sync cycle with the aggregate results. */
  onSyncComplete?: (result: SyncResult) => void;
  /** Called if the scheduler itself throws unexpectedly. */
  onError?: (err: unknown) => void;
};

/**
 * Create an imperative sync scheduler bound to a WatermelonDB `database`.
 *
 * - `start()` registers AppState listener + optional interval timer + **NetInfo** (reachable online).
 *   Returns a cleanup function — call it on sign-out or component unmount.
 * - `runSync()` can be called imperatively at any time (safe to call while running; deduped via lock).
 *
 * Each cycle: **push** attendance + registration (parallel) → **revocation pull** (when `siteId` set) → **attendance reconcile** (when `siteId` set).
 *
 * Triggers:
 *   1. App foreground (`AppState` active)
 *   2. Periodic timer (every `intervalMs`, default 5 min)
 *   3. **Network** — `NetInfo` reports connected (and not explicitly unreachable)
 *   4. Imperative call to `runSync()`
 *
 * **Revocation sync** runs after pushes when `siteId` is configured (see `syncRevocationsFromServer`).
 */
export function createSyncScheduler(config: SyncSchedulerConfig) {
  const { database, siteId, deviceId, intervalMs = 5 * 60_000, onSyncComplete, onError } = config;
  let running = false;
  const purgePolicy = attendancePurgePolicyFromEnv(Config.ATTENDANCE_PURGE_AFTER_INTEGRATION);

  const runSync = async (): Promise<SyncResult | null> => {
    if (running) return null;
    running = true;
    try {
      const [attSettled, regSettled] = await Promise.allSettled([
        pushPendingAttendanceOutbox(database),
        pushPendingRegistrationOutbox(database),
      ]);

      const attendance =
        attSettled.status === 'fulfilled'
          ? attSettled.value
          : {
              uploaded: 0,
              errors: [(attSettled as PromiseRejectedResult).reason?.message ?? 'unknown'],
              deadLettered: 0,
            };

      const registration =
        regSettled.status === 'fulfilled'
          ? regSettled.value
          : {
              uploaded: 0,
              errors: [(regSettled as PromiseRejectedResult).reason?.message ?? 'unknown'],
              deadLettered: 0,
            };

      let revocations: { applied: number; errors: string[] } | undefined;
      let reconcileAttendance: { updated: number; errors: string[] } | undefined;
      if (siteId && siteId.trim().length > 0) {
        const sid = siteId.trim();
        try {
          revocations = await syncRevocationsFromServer(database, {
            siteId: sid,
            deviceId: deviceId?.trim(),
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          revocations = { applied: 0, errors: [msg] };
        }

        try {
          reconcileAttendance = await reconcileAttendanceFromServer(database, {
            siteId: sid,
            purgePolicy,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          reconcileAttendance = { updated: 0, errors: [msg] };
        }
      }

      const result: SyncResult = { attendance, registration, revocations, reconcileAttendance };
      onSyncComplete?.(result);
      return result;
    } catch (err) {
      onError?.(err);
      return null;
    } finally {
      running = false;
    }
  };

  const start = () => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        runSync().catch(onError);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      timer = setInterval(() => {
        runSync().catch(onError);
      }, intervalMs);
    }

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected !== true) {
        return;
      }
      if (state.isInternetReachable === false) {
        return;
      }
      runSync().catch(onError);
    });

    // Run once immediately on start.
    runSync().catch(onError);

    return () => {
      sub.remove();
      if (timer !== null) clearInterval(timer);
      unsubscribeNetInfo();
    };
  };

  return { start, runSync };
}

/**
 * React hook — mounts the sync scheduler for the lifetime of the component.
 *
 * **Mount point:** wrap with a device-session gate (only active when signed in as `device` role).
 *
 * ```tsx
 * useSyncScheduler({ database, siteId: sessionSiteId, intervalMs: 5 * 60_000 });
 * ```
 */
export function useSyncScheduler(config: SyncSchedulerConfig): { runSync: () => Promise<SyncResult | null> } {
  const schedulerRef = useRef<ReturnType<typeof createSyncScheduler> | null>(null);

  useEffect(() => {
    const scheduler = createSyncScheduler(config);
    schedulerRef.current = scheduler;
    const cleanup = scheduler.start();
    return cleanup;
    // Intentionally omitting config from deps — scheduler lifetime = component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    runSync: () => schedulerRef.current?.runSync() ?? Promise.resolve(null),
  };
}
