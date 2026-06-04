import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';

import type { AttendanceRecordModel } from '@/db/models/AttendanceRecordModel';
import { fetchAttendanceRecordsByIds } from '@/repositories/attendanceRepository';
import type { AttendancePurgePolicy } from '@/services/sync/syncStatusMap';
import { computeLocalAttendanceMirrorFromRemote } from '@/services/sync/syncStatusMap';

export type AttendanceReconcileOptions = {
  siteId: string;
  purgePolicy: AttendancePurgePolicy;
};

export type AttendanceReconcileResult = {
  /** Rows whose local fields were updated from server. */
  updated: number;
  errors: string[];
};

/**
 * Pull server truth for rows we already uploaded (`server_record_id` set) and
 * mirror `sync_status`, `integration_push_status`, and purge policy onto WMDB.
 *
 * Use after `pushPendingAttendanceOutbox` when online — covers supervisor/server-side edits
 * and integration pipeline updates without re-uploading payloads.
 */
export async function reconcileAttendanceFromServer(
  database: Database,
  options: AttendanceReconcileOptions,
): Promise<AttendanceReconcileResult> {
  const { siteId, purgePolicy } = options;
  const errors: string[] = [];
  let updated = 0;

  const collection = database.collections.get<AttendanceRecordModel>('attendance_records');
  const locals = await collection.query(Q.where('site_id', siteId)).fetch();
  const withServerId = locals.filter((m) => m.serverRecordId != null && m.serverRecordId.length > 0);
  if (withServerId.length === 0) {
    return { updated: 0, errors };
  }

  const ids = [...new Set(withServerId.map((m) => m.serverRecordId!))];
  let remoteRows: Awaited<ReturnType<typeof fetchAttendanceRecordsByIds>>;
  try {
    remoteRows = await fetchAttendanceRecordsByIds(ids);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return { updated: 0, errors };
  }

  const byId = new Map(remoteRows.map((r) => [r.id, r]));

  await database.write(async () => {
    for (const m of withServerId) {
      const sid = m.serverRecordId!;
      const row = byId.get(sid);
      if (!row) {
        continue;
      }

      const mirror = computeLocalAttendanceMirrorFromRemote(row, purgePolicy);

      const purgedAligned =
        mirror.outboxSyncStatus !== 'purged'
          ? (m.purgedAt == null) === (mirror.purgedAtMs == null)
          : m.purgedAt != null && mirror.purgedAtMs != null;

      const same =
        m.outboxSyncStatus === mirror.outboxSyncStatus &&
        m.integrationPushStatus === mirror.integrationPushStatus &&
        purgedAligned &&
        (m.syncedAt ?? 0) === mirror.syncedAtMs;

      if (same) {
        continue;
      }

      await m.update((rec) => {
        rec.outboxSyncStatus = mirror.outboxSyncStatus;
        rec.integrationPushStatus = mirror.integrationPushStatus;
        rec.syncedAt = mirror.syncedAtMs;
        rec.purgedAt = mirror.purgedAtMs;
      });
      updated++;
    }
  });

  return { updated, errors };
}
