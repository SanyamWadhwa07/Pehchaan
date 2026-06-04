import type { AttendanceRecordRow } from '@/lib/db/rows';
import type { IntegrationPushStatus, SyncStatus } from '@/types';

/** Postgres `sync_status_enum` and WMDB `outbox_sync_status` share the same string values. */
export const SYNC_STATUS_VALUES: readonly SyncStatus[] = [
  'pending',
  'uploading',
  'verified',
  'purged',
  'failed',
] as const;

export function isSyncStatus(value: string): value is SyncStatus {
  return (SYNC_STATUS_VALUES as readonly string[]).includes(value);
}

/** Map server `sync_status` onto local outbox column (same enum strings). */
export function postgresSyncStatusToOutbox(status: string): SyncStatus {
  if (isSyncStatus(status)) {
    return status;
  }
  return 'failed';
}

export function isOutboxEligibleForUpload(outboxStatus: string): boolean {
  return outboxStatus === 'pending' || outboxStatus === 'failed';
}

export function integrationPushFromRemote(
  value: string | null | undefined,
): IntegrationPushStatus {
  const v = value ?? 'queued';
  if (v === 'queued' || v === 'pushed' || v === 'failed' || v === 'not_applicable') {
    return v;
  }
  return 'queued';
}

/**
 * When the local row may move to **`purged`** after a successful server mirror.
 *
 * - **`immediate_after_verified`** — as soon as Postgres reports `sync_status = verified`,
 *   the device marks the WMDB row `purged` and sets `purged_at` (tombstone; row retained).
 * - **`after_integration_push`** — stay `verified` until `integration_push_status` is
 *   `pushed` or `not_applicable`, then mark `purged`. If integration stays `queued` or `failed`,
 *   the row remains `verified` until the server updates integration (see `docs/SYNC_STATE_MACHINE.md`).
 */
export type AttendancePurgePolicy = 'immediate_after_verified' | 'after_integration_push';

/** `ATTENDANCE_PURGE_AFTER_INTEGRATION=true` in `.env` → wait for integration push before local purge. */
export function attendancePurgePolicyFromEnv(raw: string | undefined): AttendancePurgePolicy {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') {
    return 'after_integration_push';
  }
  return 'immediate_after_verified';
}

/**
 * Map a server `attendance_records` row onto local WMDB fields after upload or reconcile.
 * See **`docs/SYNC_STATE_MACHINE.md`** for the full transition diagram.
 */
export function computeLocalAttendanceMirrorFromRemote(
  remote: Pick<
    AttendanceRecordRow,
    'sync_status' | 'integration_push_status' | 'purged_at' | 'synced_at'
  >,
  purgePolicy: AttendancePurgePolicy,
): {
  outboxSyncStatus: SyncStatus;
  purgedAtMs: number | null;
  integrationPushStatus: IntegrationPushStatus;
  syncedAtMs: number;
} {
  const integration = integrationPushFromRemote(remote.integration_push_status);
  const baseStatus = postgresSyncStatusToOutbox(remote.sync_status);
  const syncedAtMs = remote.synced_at ? Date.parse(remote.synced_at) : Date.now();

  if (remote.purged_at) {
    return {
      outboxSyncStatus: 'purged',
      purgedAtMs: Date.parse(remote.purged_at),
      integrationPushStatus: integration,
      syncedAtMs,
    };
  }

  if (baseStatus === 'purged') {
    return {
      outboxSyncStatus: 'purged',
      purgedAtMs: Date.now(),
      integrationPushStatus: integration,
      syncedAtMs,
    };
  }

  if (baseStatus === 'failed') {
    return {
      outboxSyncStatus: 'failed',
      purgedAtMs: null,
      integrationPushStatus: integration,
      syncedAtMs,
    };
  }

  if (baseStatus === 'verified') {
    if (purgePolicy === 'immediate_after_verified') {
      return {
        outboxSyncStatus: 'purged',
        purgedAtMs: Date.now(),
        integrationPushStatus: integration,
        syncedAtMs,
      };
    }
    const integrationDone =
      integration === 'pushed' || integration === 'not_applicable';
    if (integrationDone) {
      return {
        outboxSyncStatus: 'purged',
        purgedAtMs: Date.now(),
        integrationPushStatus: integration,
        syncedAtMs,
      };
    }
    return {
      outboxSyncStatus: 'verified',
      purgedAtMs: null,
      integrationPushStatus: integration,
      syncedAtMs,
    };
  }

  return {
    outboxSyncStatus: baseStatus,
    purgedAtMs: null,
    integrationPushStatus: integration,
    syncedAtMs,
  };
}
