import {requireSupabase} from '@/lib/supabase';
import type {RegistrationRequestRow} from '@/lib/db/rows';

const REG_COLUMNS =
  'id, worker_name, role, aadhaar_ref_hash, site_id, submitted_by, status, review_note, created_at, approved_at, captured_angles_json';

export type RegistrationInsert = {
  worker_name: string;
  role: string;
  aadhaar_ref_hash?: string | null;
  site_id: string;
  submitted_by?: string | null;
  status?: RegistrationRequestRow['status'];
  /** Face captures — PostgREST `jsonb`; may include storage refs for large blobs. */
  captured_angles_json?: RegistrationRequestRow['captured_angles_json'];
};

export async function insertRegistrationRequest(
  row: RegistrationInsert,
): Promise<RegistrationRequestRow> {
  const {data, error} = await requireSupabase()
    .from('registration_requests')
    .insert({
      worker_name: row.worker_name,
      role: row.role,
      aadhaar_ref_hash: row.aadhaar_ref_hash ?? null,
      site_id: row.site_id,
      submitted_by: row.submitted_by ?? null,
      status: row.status ?? 'pending',
      captured_angles_json: row.captured_angles_json ?? null,
    })
    .select(REG_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return data as RegistrationRequestRow;
}

export type ApproveRegistrationResult = {
  ok: boolean;
  worker_id: string | null;
  registration_request_id: string;
  idempotent?: boolean;
  worker?: {
    id: string;
    name: string;
    role: string;
    site_id: string;
    enrolled_at: string;
  };
};

export type ApproveRegistrationOptions = {
  /**
   * Optional 512×float32 LE vector as standard base64 (2048 raw bytes).
   * When set, Edge persists `workers.embedding_encrypted` and triggers `create-site-package`.
   */
  embeddingBase64?: string;
};

/**
 * Call the Edge `register-worker` function to approve a pending registration:
 * creates a `workers` row and marks the `registration_requests` row as `'approved'`.
 *
 * Requires supervisor JWT for the registration's site, or admin JWT.
 */
export async function approveRegistrationRequest(
  registrationRequestId: string,
  options?: ApproveRegistrationOptions,
): Promise<ApproveRegistrationResult> {
  const body: Record<string, string> = {
    registration_request_id: registrationRequestId,
  };
  const emb = options?.embeddingBase64?.trim();
  if (emb) {
    body.embedding_base64 = emb;
  }

  const {data, error} = await requireSupabase().functions.invoke(
    'register-worker',
    {
      body,
    },
  );
  if (error) {
    throw error;
  }
  return data as ApproveRegistrationResult;
}

export async function fetchRegistrationRequestsForSite(
  siteId: string,
  limit = 50,
): Promise<RegistrationRequestRow[]> {
  const {data, error} = await requireSupabase()
    .from('registration_requests')
    .select(REG_COLUMNS)
    .eq('site_id', siteId)
    .order('created_at', {ascending: false})
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data ?? []) as RegistrationRequestRow[];
}
