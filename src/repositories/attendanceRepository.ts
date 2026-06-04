import { supabase } from '@/lib/supabase';
import type { AttendanceRecordRow } from '@/lib/db/rows';

const ATT_COLUMNS =
  'id, worker_id, site_id, device_id, auth_timestamp, confidence_score, auth_tier, liveness_score, liveness_passed, challenge_type, challenge_result, supervisor_id, supervisor_confirmed, sync_status, server_record_id, synced_at, purged_at, fail_reason, integration_push_status, client_event_id';

/** JSON objects for `insert_attendance_batch_idempotent` (Postgres snake_case keys). */
export function attendanceRowToRpcPayload(
  row: Omit<AttendanceRecordRow, 'id'> & { id?: string },
): Record<string, unknown> {
  return {
    worker_id: row.worker_id,
    site_id: row.site_id,
    device_id: row.device_id,
    auth_timestamp: row.auth_timestamp,
    confidence_score: row.confidence_score,
    auth_tier: row.auth_tier,
    liveness_score: row.liveness_score,
    liveness_passed: row.liveness_passed,
    challenge_type: row.challenge_type,
    challenge_result: row.challenge_result,
    supervisor_id: row.supervisor_id,
    supervisor_confirmed: row.supervisor_confirmed,
    sync_status: row.sync_status,
    server_record_id: row.server_record_id,
    synced_at: row.synced_at,
    purged_at: row.purged_at,
    fail_reason: row.fail_reason,
    integration_push_status: row.integration_push_status,
    client_event_id: row.client_event_id ?? null,
  };
}

export async function insertAttendanceRecord(
  row: Omit<AttendanceRecordRow, 'id'> & { id?: string },
): Promise<AttendanceRecordRow> {
  const { data, error } = await supabase.rpc('insert_attendance_batch_idempotent', {
    p_rows: [attendanceRowToRpcPayload(row)],
  });

  if (error) {
    throw error;
  }
  const arr = (data ?? []) as AttendanceRecordRow[];
  const first = arr[0];
  if (!first) {
    throw new Error('insert_attendance_batch_idempotent returned no rows');
  }
  return first;
}

/** Batch idempotent insert (device JWT). Order of returned rows matches input order. */
export async function insertAttendanceRecordsBatch(
  rows: Array<Omit<AttendanceRecordRow, 'id'> & { id?: string }>,
): Promise<AttendanceRecordRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const { data, error } = await supabase.rpc('insert_attendance_batch_idempotent', {
    p_rows: rows.map(attendanceRowToRpcPayload),
  });

  if (error) {
    throw error;
  }
  return (data ?? []) as AttendanceRecordRow[];
}

const FETCH_BY_IDS_CHUNK = 100;

/** Fetch specific server rows by primary key (for reconcile). Chunks to avoid URL limits. */
export async function fetchAttendanceRecordsByIds(
  ids: string[],
): Promise<AttendanceRecordRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const out: AttendanceRecordRow[] = [];
  for (let i = 0; i < ids.length; i += FETCH_BY_IDS_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_BY_IDS_CHUNK);
    const { data, error } = await supabase
      .from('attendance_records')
      .select(ATT_COLUMNS)
      .in('id', chunk);
    if (error) {
      throw error;
    }
    out.push(...((data ?? []) as AttendanceRecordRow[]));
  }
  return out;
}

export async function fetchAttendanceForSite(
  siteId: string,
  limit = 50,
): Promise<AttendanceRecordRow[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select(ATT_COLUMNS)
    .eq('site_id', siteId)
    .order('auth_timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data ?? []) as AttendanceRecordRow[];
}
