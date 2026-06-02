import { supabase } from '@/lib/supabase';
import type { RegistrationRequestRow } from '@/lib/db/rows';

const REG_COLUMNS =
  'id, worker_name, role, aadhaar_ref_hash, site_id, submitted_by, status, review_note, created_at, approved_at';

export type RegistrationInsert = {
  worker_name: string;
  role: string;
  aadhaar_ref_hash?: string | null;
  site_id: string;
  submitted_by?: string | null;
  status?: RegistrationRequestRow['status'];
};

export async function insertRegistrationRequest(
  row: RegistrationInsert,
): Promise<RegistrationRequestRow> {
  const { data, error } = await supabase
    .from('registration_requests')
    .insert({
      worker_name: row.worker_name,
      role: row.role,
      aadhaar_ref_hash: row.aadhaar_ref_hash ?? null,
      site_id: row.site_id,
      submitted_by: row.submitted_by ?? null,
      status: row.status ?? 'pending',
    })
    .select(REG_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return data as RegistrationRequestRow;
}

export async function fetchRegistrationRequestsForSite(
  siteId: string,
  limit = 50,
): Promise<RegistrationRequestRow[]> {
  const { data, error } = await supabase
    .from('registration_requests')
    .select(REG_COLUMNS)
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data ?? []) as RegistrationRequestRow[];
}
