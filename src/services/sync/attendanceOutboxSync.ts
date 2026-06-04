/**
 * Attendance outbox — upload + mirror server state onto WatermelonDB.
 *
 * ## State machine (5 + failure path)
 *
 * Canonical diagram and product decisions: **`docs/SYNC_STATE_MACHINE.md`**.
 * Idempotency / replay semantics: **`docs/OFFLINE_IDEMPOTENCY.md`**.
 *
 * **Happy path:** `pending` → `uploading` → *(server `verified` from **`insert_attendance_batch_idempotent`**)* → mirror → often **`purged`**
 * (tombstone; row kept with `purged_at` set — see purge policy below).
 *
 * **Retry path:** `failed` → *(exponential backoff elapsed)* → `pending` → …
 *
 * **Stuck `uploading`:** reset to `pending` at the start of each run (crash / kill mid-request).
 *
 * **Dead letter:** after `ATTENDANCE_MAX_RETRIES` consecutive failures, row stays `failed` with reason;
 *   no further uploads (see `computeLocalAttendanceMirrorFromRemote` only applies after success).
 *
 * @module attendanceOutboxSync
 */
import {Q} from '@nozbe/watermelondb';
import type {Database} from '@nozbe/watermelondb';
import Config from 'react-native-config';

import type {AttendanceRecordModel} from '@/db/models/AttendanceRecordModel';
import {insertAttendanceRecordsBatch} from '@/repositories/attendanceRepository';
import type {AttendanceRecordRow} from '@/lib/db/rows';
import {randomUuidV4} from '@/lib/randomUuid';

import {
  attendancePurgePolicyFromEnv,
  computeLocalAttendanceMirrorFromRemote,
} from '@/services/sync/syncStatusMap';

/** Maximum upload attempts before a row is permanently dead-lettered. */
export const ATTENDANCE_MAX_RETRIES = 5;

/** Initial backoff after first failure: 30 s. Doubles each attempt; capped at 1 h. */
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Compute whether a `failed` row has waited long enough to retry.
 * `retryCount = 0` means first attempt, always eligible.
 * `retryCount >= ATTENDANCE_MAX_RETRIES` means dead-lettered, never retry.
 *
 * Backoff schedule (approximate):
 *   attempt 1 → 30 s
 *   attempt 2 → 60 s
 *   attempt 3 → 2 min
 *   attempt 4 → 4 min
 *   attempt 5 → dead-lettered
 */
function isBackoffExpired(
  retryCount: number,
  lastErrorAt: number | null,
): boolean {
  if (retryCount <= 0) {
    return true;
  }
  if (retryCount >= ATTENDANCE_MAX_RETRIES) {
    return false;
  }
  if (lastErrorAt == null) {
    return true;
  }
  const backoffMs = Math.min(
    BASE_BACKOFF_MS * Math.pow(2, retryCount - 1),
    MAX_BACKOFF_MS,
  );
  return Date.now() - lastErrorAt >= backoffMs;
}

function isEligibleForUpload(m: AttendanceRecordModel): boolean {
  if (m.outboxSyncStatus === 'pending') {
    return true;
  }
  if (m.outboxSyncStatus === 'failed') {
    return isBackoffExpired(m.retryCount, m.lastErrorAt);
  }
  return false;
}

function rowFromLocal(
  m: AttendanceRecordModel,
): Omit<AttendanceRecordRow, 'id'> {
  const sup = m.supervisorId?.trim();
  return {
    worker_id: m.workerId,
    site_id: m.siteId,
    device_id: m.deviceId,
    auth_timestamp: new Date(m.authTimestamp).toISOString(),
    confidence_score: m.confidenceScore,
    auth_tier: (m.authTier as AttendanceRecordRow['auth_tier']) ?? null,
    liveness_score: m.livenessScore,
    liveness_passed: m.livenessPassed,
    challenge_type: m.challengeType,
    challenge_result: m.challengeResult,
    supervisor_id: sup && sup.length > 0 ? sup : null,
    supervisor_confirmed: m.supervisorConfirmed,
    sync_status: 'pending',
    server_record_id: null,
    synced_at: null,
    purged_at: null,
    fail_reason: null,
    integration_push_status:
      m.integrationPushStatus as AttendanceRecordRow['integration_push_status'],
    client_event_id: m.clientEventId?.trim() ? m.clientEventId.trim() : null,
  };
}

export type AttendanceOutboxSyncOptions = {
  /** Max local rows per Supabase request (default 25). */
  batchSize?: number;
};

export type AttendanceOutboxSyncResult = {
  uploaded: number;
  errors: string[];
  /** Rows skipped because they hit the dead-letter threshold. */
  deadLettered: number;
};

/**
 * Push local attendance rows to Postgres: WMDB `outbox_sync_status` ↔ `sync_status`.
 *
 * - Eligible: `pending` rows and `failed` rows whose exponential-backoff timer has expired.
 * - Dead-letters: rows that have failed `ATTENDANCE_MAX_RETRIES` times (stops attempting).
 * - Marks local rows `uploading` before the network call to avoid double-submit on crash.
 * - After success: mirrors server row and applies **purge policy** (`ATTENDANCE_PURGE_AFTER_INTEGRATION` in `.env`).
 *
 * **Requires device JWT** (RLS: only device role can insert `attendance_records` for its site).
 */
export async function pushPendingAttendanceOutbox(
  database: Database,
  options: AttendanceOutboxSyncOptions = {},
): Promise<AttendanceOutboxSyncResult> {
  const batchSize = options.batchSize ?? 25;
  const errors: string[] = [];
  let uploaded = 0;
  let deadLettered = 0;
  const purgePolicy = attendancePurgePolicyFromEnv(Config.ATTENDANCE_PURGE_AFTER_INTEGRATION);

  const collection =
    database.collections.get<AttendanceRecordModel>('attendance_records');

  // Rows stuck in 'uploading' mean the previous run was interrupted (kill, crash, etc.).
  // Reset them to 'pending' so they are retried. Re-send is safe: each row carries a
  // stable `client_event_id` (assigned before first upload) so Postgres maps retries to one row.
  const stuck = await collection
    .query(Q.where('outbox_sync_status', 'uploading'))
    .fetch();
  if (stuck.length > 0) {
    await database.write(async () => {
      for (const m of stuck) {
        await m.update(rec => {
          rec.outboxSyncStatus = 'pending';
        });
      }
    });
  }

  // Fetch both pending and failed in a single query; filter eligibility in memory.
  const candidates = await collection
    .query(Q.where('outbox_sync_status', Q.oneOf(['pending', 'failed'])))
    .fetch();

  // Split into eligible and dead-lettered.
  const eligible: AttendanceRecordModel[] = [];
  const toDeadLetter: AttendanceRecordModel[] = [];

  for (const m of candidates) {
    if (
      m.outboxSyncStatus === 'failed' &&
      m.retryCount >= ATTENDANCE_MAX_RETRIES
    ) {
      toDeadLetter.push(m);
    } else if (isEligibleForUpload(m)) {
      eligible.push(m);
    }
  }

  // Persist dead-letter status for rows that exceeded max retries.
  if (toDeadLetter.length > 0) {
    deadLettered = toDeadLetter.length;
    await database.write(async () => {
      for (const m of toDeadLetter) {
        await m.update(rec => {
          rec.failReason = `dead_lettered after ${m.retryCount} attempts`;
        });
      }
    });
  }

  const slice = eligible.slice(0, batchSize);
  if (slice.length === 0) {
    return {uploaded: 0, errors, deadLettered};
  }

  // Mark uploading to avoid duplicate submission on crash/restart.
  // Assign `client_event_id` once per logical tap (first time we enter uploading) for server idempotency.
  await database.write(async () => {
    for (const m of slice) {
      await m.update(rec => {
        rec.outboxSyncStatus = 'uploading';
        rec.failReason = null;
        const existing = rec.clientEventId?.trim();
        if (!existing) {
          rec.clientEventId = randomUuidV4();
        }
      });
    }
  });

  const payloads = slice.map(rowFromLocal);

  let remoteRows: AttendanceRecordRow[];
  try {
    remoteRows = await insertAttendanceRecordsBatch(payloads);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    await database.write(async () => {
      for (const m of slice) {
        await m.update(rec => {
          rec.outboxSyncStatus = 'failed';
          rec.retryCount = m.retryCount + 1;
          rec.lastErrorAt = Date.now();
          rec.failReason = msg.slice(0, 500);
        });
      }
    });
    return {uploaded: 0, errors, deadLettered};
  }

  if (remoteRows.length !== slice.length) {
    const msg = `batch size mismatch: sent ${slice.length}, got ${remoteRows.length}`;
    errors.push(msg);
    await database.write(async () => {
      for (const m of slice) {
        await m.update(rec => {
          rec.outboxSyncStatus = 'failed';
          rec.retryCount = m.retryCount + 1;
          rec.lastErrorAt = Date.now();
          rec.failReason = 'batch response mismatch';
        });
      }
    });
    return {uploaded: 0, errors, deadLettered};
  }

  await database.write(async () => {
    for (let i = 0; i < slice.length; i++) {
      const m = slice[i]!;
      const row = remoteRows[i]!;
      const mirror = computeLocalAttendanceMirrorFromRemote(row, purgePolicy);
      await m.update(rec => {
        rec.serverRecordId = row.id;
        rec.outboxSyncStatus = mirror.outboxSyncStatus;
        rec.integrationPushStatus = mirror.integrationPushStatus;
        rec.syncedAt = mirror.syncedAtMs;
        rec.purgedAt = mirror.purgedAtMs;
        rec.retryCount = 0;
        rec.lastErrorAt = null;
      });
    }
  });

  uploaded = slice.length;
  return {uploaded, errors, deadLettered};
}
