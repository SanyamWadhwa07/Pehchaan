import {requireSupabase} from '@/lib/supabase';
import type {WorkerRow} from '@/lib/db/rows';

const WORKER_COLUMNS =
  'id, name, role, site_id, reference_thumbnail_url, enrolled_at, revoked_at, created_by, language_preference';

/**
 * Workers visible to the current JWT (RLS). Excludes `embedding_encrypted` (not selectable by anon).
 */
export async function fetchWorkersBySite(siteId: string): Promise<WorkerRow[]> {
  const {data, error} = await requireSupabase()
    .from('workers')
    .select(WORKER_COLUMNS)
    .eq('site_id', siteId)
    .order('name', {ascending: true});

  if (error) {
    throw error;
  }
  return (data ?? []) as WorkerRow[];
}

export async function fetchWorkerById(
  workerId: string,
): Promise<WorkerRow | null> {
  const {data, error} = await requireSupabase()
    .from('workers')
    .select(WORKER_COLUMNS)
    .eq('id', workerId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return (data as WorkerRow | null) ?? null;
}
