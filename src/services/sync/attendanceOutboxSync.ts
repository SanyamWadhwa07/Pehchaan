import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';

import type { AttendanceRecordModel } from '@/db/models/AttendanceRecordModel';
import { insertAttendanceRecordsBatch } from '@/repositories/attendanceRepository';
import type { AttendanceRecordRow } from '@/lib/db/rows';

import {
  integrationPushFromRemote,
  isOutboxEligibleForUpload,
  postgresSyncStatusToOutbox,
} from '@/services/sync/syncStatusMap';

export type AttendanceOutboxSyncOptions = {
  /** Max local rows per Supabase request */
  batchSize?: number;
};

function rowFromLocal(m: AttendanceRecordModel): Omit<AttendanceRecordRow, 'id'> {
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
    integration_push_status: m.integrationPushStatus as AttendanceRecordRow['integration_push_status'],
  };
}

/**
 * Push local attendance rows to Postgres: WMDB `outbox_sync_status` ↔ `sync_status`.
 * Marks local `uploading` before network; on success mirrors server row; on failure sets `failed`.
 *
 * **Requires device JWT** (RLS: only device role can insert `attendance_records` for its site).
 */
export async function pushPendingAttendanceOutbox(
  database: Database,
  options: AttendanceOutboxSyncOptions = {},
): Promise<{ uploaded: number; errors: string[] }> {
  const batchSize = options.batchSize ?? 25;
  const errors: string[] = [];
  let uploaded = 0;

  const collection = database.collections.get<AttendanceRecordModel>('attendance_records');
  const pending = await collection
    .query(Q.where('outbox_sync_status', Q.oneOf(['pending', 'failed'])))
    .fetch();

  const slice = pending.slice(0, batchSize);
  if (slice.length === 0) {
    return { uploaded: 0, errors };
  }

  await database.write(async () => {
    for (const m of slice) {
      if (!isOutboxEligibleForUpload(m.outboxSyncStatus)) {
        continue;
      }
      await m.update((rec) => {
        rec.outboxSyncStatus = 'uploading';
        rec.failReason = null;
      });
    }
  });

  const payloads = slice.map((m) => rowFromLocal(m));

  let remoteRows: AttendanceRecordRow[];
  try {
    remoteRows = await insertAttendanceRecordsBatch(payloads);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    await database.write(async () => {
      for (const m of slice) {
        await m.update((rec) => {
          rec.outboxSyncStatus = 'failed';
          rec.failReason = msg.slice(0, 500);
        });
      }
    });
    return { uploaded: 0, errors };
  }

  if (remoteRows.length !== slice.length) {
    errors.push(
      `batch size mismatch: sent ${slice.length}, got ${remoteRows.length} — marking batch failed`,
    );
    await database.write(async () => {
      for (const m of slice) {
        await m.update((rec) => {
          rec.outboxSyncStatus = 'failed';
          rec.failReason = 'batch response mismatch';
        });
      }
    });
    return { uploaded: 0, errors };
  }

  await database.write(async () => {
    for (let i = 0; i < slice.length; i++) {
      const m = slice[i]!;
      const row = remoteRows[i]!;
      await m.update((rec) => {
        rec.serverRecordId = row.id;
        rec.outboxSyncStatus = postgresSyncStatusToOutbox(row.sync_status);
        rec.integrationPushStatus = integrationPushFromRemote(row.integration_push_status);
        rec.syncedAt = row.synced_at ? Date.parse(row.synced_at) : Date.now();
      });
    }
  });

  uploaded = slice.length;
  return { uploaded, errors };
}
