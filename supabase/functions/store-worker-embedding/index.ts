/**
 * POST body:
 *   { "worker_id": "<uuid>", "embedding_base64": "<standard base64>" }
 *
 * `embedding_base64` must decode to **2048 bytes** (512 × float32 LE), matching
 * `src/services/faceRecognition/candidates.ts` (raw float32 payload in site package inner JSON).
 *
 * Auth: Bearer JWT — supervisor for the worker's site, or admin (`pehchaan_role`).
 *
 * Flow:
 *   1. Resolve worker → `site_id`.
 *   2. Verify caller is supervisor for that site (or admin).
 *   3. Decode base64 → bytes; validate length.
 *   4. `UPDATE workers.embedding_encrypted` (service role after authz — same pattern as register-worker reads).
 *   5. Invoke **`create-site-package`** for that `site_id` (forwards your JWT) so the next zip includes this worker's embedding.
 *
 * Notes:
 *   - Does **not** re-encrypt the vector with AES-GCM; the v2 site package **outer** encrypts the whole inner JSON.
 *   - Logs use short codes only (no embedding / base64 in logs).
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

/** PostgREST `bytea` hex format (see PostgREST bytea docs). */
function bytesToPostgresByteaHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return `\\x${hex}`;
}

type RequestBody = {
  worker_id?: string;
  /** Standard base64 of 512 float32 little-endian bytes (2048 raw bytes). */
  embedding_base64?: string;
  /** Alias for `embedding_base64`. */
  embedding?: string;
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
    console.error('store_worker_embedding_config_missing');
    return json(500, { error: 'missing_supabase_env' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.trim()) {
    return json(401, { error: 'unauthorized' });
  }

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

  const workerId = body.worker_id?.trim();
  const b64 = (body.embedding_base64 ?? body.embedding)?.trim();
  if (!workerId) {
    return json(400, { error: 'worker_id_required' });
  }
  if (!b64) {
    return json(400, { error: 'embedding_base64_required' });
  }

  let raw: Uint8Array;
  try {
    raw = decodeBase64ToBytes(b64);
  } catch {
    return json(400, { error: 'embedding_base64_invalid' });
  }

  if (raw.length !== EMBEDDING_BYTE_LEN) {
    return json(400, {
      error: 'embedding_wrong_length',
      expected_bytes: EMBEDDING_BYTE_LEN,
      got_bytes: raw.length,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: worker, error: wErr } = await admin
    .from('workers')
    .select('id, site_id')
    .eq('id', workerId)
    .maybeSingle();

  if (wErr || !worker) {
    return json(404, { error: 'worker_not_found' });
  }

  const siteId = String(worker.site_id ?? '').trim();
  if (!siteId) {
    return json(500, { error: 'worker_missing_site' });
  }

  const pehchaanRole = (user.app_metadata?.pehchaan_role as string | undefined) ?? '';

  if (pehchaanRole !== 'admin') {
    const { data: site, error: siteErr } = await admin
      .from('sites')
      .select('supervisor_id')
      .eq('id', siteId)
      .maybeSingle();

    if (siteErr || !site) {
      return json(404, { error: 'site_not_found' });
    }
    if (site.supervisor_id !== user.id) {
      console.error('store_worker_embedding_forbidden');
      return json(403, { error: 'forbidden_not_supervisor_for_site' });
    }
  }

  const byteaHex = bytesToPostgresByteaHex(raw);

  const { error: upErr } = await admin
    .from('workers')
    .update({ embedding_encrypted: byteaHex })
    .eq('id', workerId)
    .eq('site_id', siteId);

  if (upErr) {
    console.error('store_worker_embedding_update_failed', { code: upErr.code });
    return json(500, {
      error: 'embedding_update_failed',
      detail: upErr.message,
    });
  }

  const idemKey = `emb:${workerId}:${crypto.randomUUID()}`.slice(0, 128);

  let packageJson: Record<string, unknown> | null = null;
  let packageError: string | null = null;

  try {
    const pkgRes = await fetch(`${supabaseUrl}/functions/v1/create-site-package`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({ site_id: siteId, idempotency_key: idemKey }),
    });
    const pkgText = await pkgRes.text();
    try {
      packageJson = JSON.parse(pkgText) as Record<string, unknown>;
    } catch {
      packageJson = { raw: pkgText.slice(0, 500) };
    }
    if (!pkgRes.ok) {
      packageError = `create_site_package_http_${pkgRes.status}`;
      console.error('store_worker_embedding_package_failed', {
        status: pkgRes.status,
      });
    }
  } catch (e) {
    packageError = e instanceof Error ? e.message : 'package_fetch_failed';
    console.error('store_worker_embedding_package_exception');
  }

  return json(200, {
    ok: packageError === null,
    worker_id: workerId,
    site_id: siteId,
    embedding_bytes: EMBEDDING_BYTE_LEN,
    embedding_stored: true,
    package_rebuilt: packageError === null,
    site_package: packageJson,
    ...(packageError ? { package_error: packageError } : {}),
  });
});
