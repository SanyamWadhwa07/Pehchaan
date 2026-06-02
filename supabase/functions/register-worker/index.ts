/**
 * POST body:
 *   { "registration_request_id": "<uuid>" }
 *
 * Auth: Bearer JWT — supervisor for the registration's site, or admin.
 *
 * Flow:
 *   1. Fetch `registration_requests` row (status must be `'pending'`).
 *   2. Verify caller is supervisor for that site (or admin).
 *   3. Insert a new `workers` row using the registration data.
 *   4. Mark `registration_requests.status = 'approved'`, `approved_at = now()`.
 *   5. Return `{ ok, worker_id, registration_request_id }`.
 *
 * Notes:
 *   - `embedding_encrypted` is NOT set here; the ML enrollment pipeline adds it later.
 *   - The `workers` INSERT goes through PostgREST with the supervisor JWT, so the
 *     `workers_insert_supervisor` RLS policy applies (created_by = auth.uid(), supervisor for site).
 *   - Idempotent: if the `registration_requests` row is already `'approved'` with a
 *     corresponding worker, the function returns the existing worker_id.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type RequestBody = {
  registration_request_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: 'missing_supabase_env' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json(401, { error: 'unauthorized' });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const regId = body.registration_request_id?.trim();
  if (!regId) {
    return json(400, { error: 'registration_request_id_required' });
  }

  // Use service role for reading registration and writing workers.
  // Worker insert still enforces RLS because we use `userClient` for that — see below.
  const admin = createClient(supabaseUrl, serviceKey);

  // --- 1. Fetch the registration request ---
  const { data: reg, error: regErr } = await admin
    .from('registration_requests')
    .select('id, worker_name, role, site_id, submitted_by, status, approved_at')
    .eq('id', regId)
    .maybeSingle();

  if (regErr || !reg) {
    return json(404, { error: 'registration_request_not_found' });
  }

  // --- Idempotency: already approved --- 
  if (reg.status === 'approved') {
    // Find the worker that was created from this registration.
    const { data: existing } = await admin
      .from('workers')
      .select('id')
      .eq('site_id', reg.site_id)
      .eq('name', reg.worker_name)
      .eq('role', reg.role)
      .maybeSingle();

    return json(200, {
      ok: true,
      idempotent: true,
      worker_id: existing?.id ?? null,
      registration_request_id: regId,
    });
  }

  if (reg.status !== 'pending' && reg.status !== 'pending_registration') {
    return json(409, {
      error: 'registration_not_pending',
      status: reg.status,
    });
  }

  // --- 2. Verify caller is supervisor for this site (or admin) ---
  const pehchaanRole = (user.app_metadata?.pehchaan_role as string | undefined) ?? '';

  if (pehchaanRole !== 'admin') {
    const { data: site, error: siteErr } = await admin
      .from('sites')
      .select('supervisor_id')
      .eq('id', reg.site_id)
      .maybeSingle();

    if (siteErr || !site) {
      return json(404, { error: 'site_not_found' });
    }
    if (site.supervisor_id !== user.id) {
      return json(403, { error: 'forbidden_not_supervisor_for_site' });
    }
  }

  // --- 3. Insert the new worker (via userClient — RLS: supervisor for site) ---
  const { data: worker, error: workerErr } = await userClient
    .from('workers')
    .insert({
      name: reg.worker_name,
      role: reg.role,
      site_id: reg.site_id,
      created_by: user.id,
    })
    .select('id, name, role, site_id, enrolled_at')
    .single();

  if (workerErr || !worker) {
    console.error('worker_insert_failed', { reg_id: regId, code: workerErr?.message });
    return json(500, {
      error: 'worker_insert_failed',
      detail: workerErr?.message ?? 'unknown',
    });
  }

  // --- 4. Mark registration as approved (service role — status update) ---
  const { error: approveErr } = await admin
    .from('registration_requests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', regId);

  if (approveErr) {
    // Worker was inserted; log but don't fail — the caller has the worker_id.
    console.error('registration_approve_failed', { reg_id: regId, code: approveErr.message });
  }

  return json(200, {
    ok: true,
    worker_id: worker.id,
    registration_request_id: regId,
    worker: {
      id: worker.id,
      name: worker.name,
      role: worker.role,
      site_id: worker.site_id,
      enrolled_at: worker.enrolled_at,
    },
  });
});
