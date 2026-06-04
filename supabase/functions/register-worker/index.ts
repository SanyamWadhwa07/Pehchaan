/**
 * POST body:
 *   { "registration_request_id": "<uuid>",
 *     "embedding_base64"?: "<standard base64>",   // optional: 512×float32 LE = 2048 raw bytes
 *     "embedding"?: "<same as embedding_base64>" }
 *
 * Auth: Bearer JWT — supervisor for the registration's site, or admin.
 *
 * Flow:
 *   1. If `embedding_base64` / `embedding` is present, validate **before** mutating rows (400 on bad input).
 *   2. Fetch `registration_requests` row (status must be `'pending'` or `'pending_registration'`).
 *   3. Verify caller is supervisor for that site (or admin).
 *   4. Insert a new `workers` row using the registration data.
 *   5. Mark `registration_requests.status = 'approved'`, `approved_at = now()`.
 *   6. When embedding was provided: `UPDATE workers.embedding_encrypted`, then invoke **`create-site-package`** (same JWT) so the zip includes the worker.
 *   5b. **Idempotent** (`already approved`): if embedding is sent, apply it to the resolved worker + rebuild package.
 *
 * Notes:
 *   - The `workers` INSERT goes through PostgREST with the supervisor JWT, so the
 *     `workers_insert_supervisor` RLS policy applies (created_by = auth.uid(), supervisor for site).
 *   - Idempotent: if the `registration_requests` row is already `'approved'` with a
 *     corresponding worker, the function returns the existing worker_id (and may apply embedding).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const EMBEDDING_FLOAT32_DIM = 512;
const EMBEDDING_BYTE_LEN = EMBEDDING_FLOAT32_DIM * 4;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64.trim().replace(/\s/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i) & 0xff;
  }
  return out;
}

function bytesToPostgresByteaHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return `\\x${hex}`;
}

type RequestBody = {
  registration_request_id?: string;
  embedding_base64?: string;
  embedding?: string;
};

type AdminClient = ReturnType<typeof createClient>;

async function persistEmbeddingAndTriggerPackage(opts: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  admin: AdminClient;
  siteId: string;
  workerId: string;
  raw: Uint8Array;
}): Promise<{
  embedding_stored: boolean;
  package_rebuilt: boolean;
  site_package?: Record<string, unknown> | null;
  package_error?: string;
  embedding_error?: string;
}> {
  const byteaHex = bytesToPostgresByteaHex(opts.raw);
  const { error: upErr } = await opts.admin
    .from('workers')
    .update({ embedding_encrypted: byteaHex })
    .eq('id', opts.workerId)
    .eq('site_id', opts.siteId);

  if (upErr) {
    console.error('register_worker_embedding_update_failed', { code: upErr.code });
    return {
      embedding_stored: false,
      package_rebuilt: false,
      embedding_error: upErr.message,
    };
  }

  const idemKey = `reg-emb:${opts.workerId}:${crypto.randomUUID()}`.slice(0, 128);
  let packageJson: Record<string, unknown> | null = null;
  let packageError: string | null = null;

  try {
    const pkgRes = await fetch(`${opts.supabaseUrl}/functions/v1/create-site-package`, {
      method: 'POST',
      headers: {
        Authorization: opts.authHeader,
        apikey: opts.anonKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({ site_id: opts.siteId, idempotency_key: idemKey }),
    });
    const pkgText = await pkgRes.text();
    try {
      packageJson = JSON.parse(pkgText) as Record<string, unknown>;
    } catch {
      packageJson = { raw: pkgText.slice(0, 500) };
    }
    if (!pkgRes.ok) {
      packageError = `create_site_package_http_${pkgRes.status}`;
      console.error('register_worker_package_failed', { status: pkgRes.status });
    }
  } catch (e) {
    packageError = e instanceof Error ? e.message : 'package_fetch_failed';
    console.error('register_worker_package_exception');
  }

  return {
    embedding_stored: true,
    package_rebuilt: packageError === null,
    site_package: packageJson,
    ...(packageError ? { package_error: packageError } : {}),
  };
}

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

  const embeddingInput = (body.embedding_base64 ?? body.embedding)?.trim();
  let rawEmbedding: Uint8Array | null = null;
  if (embeddingInput) {
    try {
      rawEmbedding = decodeBase64ToBytes(embeddingInput);
    } catch {
      return json(400, { error: 'embedding_base64_invalid' });
    }
    if (rawEmbedding.length !== EMBEDDING_BYTE_LEN) {
      return json(400, {
        error: 'embedding_wrong_length',
        expected_bytes: EMBEDDING_BYTE_LEN,
        got_bytes: rawEmbedding.length,
      });
    }
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: reg, error: regErr } = await admin
    .from('registration_requests')
    .select('id, worker_name, role, site_id, submitted_by, status, approved_at')
    .eq('id', regId)
    .maybeSingle();

  if (regErr || !reg) {
    return json(404, { error: 'registration_request_not_found' });
  }

  const siteIdStr = String(reg.site_id ?? '').trim();

  if (reg.status === 'approved') {
    const { data: existing } = await admin
      .from('workers')
      .select('id')
      .eq('site_id', reg.site_id)
      .eq('name', reg.worker_name)
      .eq('role', reg.role)
      .maybeSingle();

    const base: Record<string, unknown> = {
      ok: true,
      idempotent: true,
      worker_id: existing?.id ?? null,
      registration_request_id: regId,
    };

    if (rawEmbedding && existing?.id && siteIdStr) {
      const emb = await persistEmbeddingAndTriggerPackage({
        supabaseUrl,
        anonKey,
        authHeader,
        admin,
        siteId: siteIdStr,
        workerId: existing.id,
        raw: rawEmbedding,
      });
      Object.assign(base, emb);
    }

    return json(200, base);
  }

  if (reg.status !== 'pending' && reg.status !== 'pending_registration') {
    return json(409, {
      error: 'registration_not_pending',
      status: reg.status,
    });
  }

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

  const { error: approveErr } = await admin
    .from('registration_requests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', regId);

  if (approveErr) {
    console.error('registration_approve_failed', { reg_id: regId, code: approveErr.message });
  }

  const out: Record<string, unknown> = {
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
  };

  if (rawEmbedding && siteIdStr) {
    const emb = await persistEmbeddingAndTriggerPackage({
      supabaseUrl,
      anonKey,
      authHeader,
      admin,
      siteId: siteIdStr,
      workerId: worker.id,
      raw: rawEmbedding,
    });
    Object.assign(out, emb);
  }

  return json(200, out);
});
