import {requireSupabase} from '@/lib/supabase';
import type {DeviceRow} from '@/lib/db/rows';

/** Columns selected for supervisor / device list UIs. Device sync metadata (`last_sync_at`, `trust_score`, `app_version`) is written by Edge `sync-revocations` when the app sends `device_id` (see N5). */
const DEV_COLUMNS =
  'id, supervisor_id, site_id, platform, app_version, revoked, last_sync_at, trust_score';

export async function fetchDevicesBySite(siteId: string): Promise<DeviceRow[]> {
  const {data, error} = await requireSupabase()
    .from('devices')
    .select(DEV_COLUMNS)
    .eq('site_id', siteId)
    .order('last_sync_at', {ascending: false, nullsFirst: false});

  if (error) {
    throw error;
  }
  return (data ?? []) as DeviceRow[];
}

export async function fetchDeviceById(
  deviceId: string,
): Promise<DeviceRow | null> {
  const {data, error} = await requireSupabase()
    .from('devices')
    .select(DEV_COLUMNS)
    .eq('id', deviceId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return (data as DeviceRow | null) ?? null;
}
