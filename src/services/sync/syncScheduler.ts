import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import type {Database} from '@nozbe/watermelondb';

import {pushPendingAttendanceOutbox} from '@/services/sync/attendanceOutboxSync';
import {pushPendingRegistrationOutbox} from '@/services/sync/registrationOutboxSync';

export type SyncResult = {
  attendance: {uploaded: number; errors: string[]; deadLettered: number};
  registration: {uploaded: number; errors: string[]; deadLettered: number};
};

export type SyncSchedulerConfig = {
  database: Database;
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
 * - `start()` registers AppState listener + optional interval timer.
 *   Returns a cleanup function — call it on sign-out or component unmount.
 * - `runSync()` can be called imperatively at any time (safe to call while running; deduped via lock).
 *
 * Triggers:
 *   1. App foreground (`AppState` active)
 *   2. Periodic timer (every `intervalMs`, default 5 min)
 *   3. Imperative call to `runSync()`
 */
export function createSyncScheduler(config: SyncSchedulerConfig) {
  const {database, intervalMs = 5 * 60_000, onSyncComplete, onError} = config;
  let running = false;

  const runSync = async (): Promise<SyncResult | null> => {
    if (running) {
      return null;
    }
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
              errors: [
                (attSettled as PromiseRejectedResult).reason?.message ??
                  'unknown',
              ],
              deadLettered: 0,
            };

      const registration =
        regSettled.status === 'fulfilled'
          ? regSettled.value
          : {
              uploaded: 0,
              errors: [
                (regSettled as PromiseRejectedResult).reason?.message ??
                  'unknown',
              ],
              deadLettered: 0,
            };

      const result: SyncResult = {attendance, registration};
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

    // Run once immediately on start.
    runSync().catch(onError);

    return () => {
      sub.remove();
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  };

  return {start, runSync};
}

/**
 * React hook — mounts the sync scheduler for the lifetime of the component.
 *
 * **Mount point:** wrap with a device-session gate (only active when signed in as `device` role).
 *
 * ```tsx
 * // In your device home screen or a DeviceSessionRoot component:
 * useSyncScheduler({ database, intervalMs: 5 * 60_000 });
 * ```
 */
export function useSyncScheduler(config: SyncSchedulerConfig): {
  runSync: () => Promise<SyncResult | null>;
} {
  const schedulerRef = useRef<ReturnType<typeof createSyncScheduler> | null>(
    null,
  );

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
