import {requireSupabase} from '@/lib/supabase';
import type {AttendanceRecordRow} from '@/lib/db/rows';

const ATT_COLUMNS =
  'id, worker_id, site_id, device_id, auth_timestamp, confidence_score, auth_tier, liveness_score, liveness_passed, challenge_type, challenge_result, supervisor_id, supervisor_confirmed, sync_status, server_record_id, synced_at, purged_at, fail_reason, integration_push_status';

export async function insertAttendanceRecord(
  row: Omit<AttendanceRecordRow, 'id'> & {id?: string},
): Promise<AttendanceRecordRow> {
  const {data, error} = await requireSupabase()
    .from('attendance_records')
    .insert(row)
    .select(ATT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return data as AttendanceRecordRow;
}

/** Batch insert (device JWT). Order of `data` matches insert order. */
export async function insertAttendanceRecordsBatch(
  rows: Array<Omit<AttendanceRecordRow, 'id'> & {id?: string}>,
): Promise<AttendanceRecordRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const {data, error} = await requireSupabase()
    .from('attendance_records')
    .insert(rows)
    .select(ATT_COLUMNS);

  if (error) {
    throw error;
  }
  return (data ?? []) as AttendanceRecordRow[];
}

export async function fetchAttendanceForSite(
  siteId: string,
  limit = 50,
): Promise<AttendanceRecordRow[]> {
  const {data, error} = await requireSupabase()
    .from('attendance_records')
    .select(ATT_COLUMNS)
    .eq('site_id', siteId)
    .order('auth_timestamp', {ascending: false})
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data ?? []) as AttendanceRecordRow[];
}
