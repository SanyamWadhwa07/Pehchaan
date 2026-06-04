/**
 * POST body:
 *   { "site_id": "<uuid>",
 *     "idempotency_key"?: string (max 128),
 *     "package_format"?: "full" | "incremental",
 *     "worker_ids"?: string[]   // required when package_format === "incremental"
 *   }
 *
 * Auth: Bearer JWT (supervisor for site).
 *
 * Modes:
 * - No `SITE_PACKAGE_MASTER_KEY` → **v1** plaintext manifest.zip (legacy dev).
 * - With `SITE_PACKAGE_MASTER_KEY` + `SUPABASE_SERVICE_ROLE_KEY` → **v2** AES-256-GCM
 *   inner payload (`payload.bin`) + key wrap using site master (see docs).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { gcm } from 'npm:@noble/ciphers/aes.js';
import { randomBytes } from 'npm:@noble/ciphers/utils.js';
import { strToU8, zipSync } from 'npm:fflate@0.8.2';

const SITE_PKG = 'site-packages';
const OBJECT_NAME = 'site-package.zip';
const MAX_WORKERS = 2000;
const MAX_INNER_BYTES = 20 * 1024 * 1024;
const MAX_IDEMPOTENCY_KEY_LEN = 128;

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

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length + b.length);
  o.set(a, 0);
  o.set(b, a.length);
  return o;
}

function sealAesGcm256(key32: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const iv = randomBytes(12);
  const sealed = gcm(key32, iv).encrypt(plaintext);
  return concat(iv, sealed);
}

function decodeMasterKey(b64: string): Uint8Array {
  const bin = atob(b64.trim().replace(/\s/g, ''));
  if (bin.length !== 32) {
    throw new Error('SITE_PACKAGE_MASTER_KEY must decode to 32 bytes');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))) as unknown as number[],
    );
  }
  return btoa(bin);
}

function byteaToBase64(v: unknown): string | null {
  if (v == null) {
    return null;
  }
  if (typeof v === 'string') {
    if (v.startsWith('\\x') || v.startsWith('\\X')) {
      const hex = v.slice(2);
      const clean = hex.replace(/\s/g, '');
      if (clean.length % 2 !== 0) {
        return null;
      }
      const out = new Uint8Array(clean.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return bytesToBase64(out);
    }
    return v;
  }
  if (v instanceof Uint8Array) {
    return bytesToBase64(v);
  }
  return null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type RequestBody = {
  site_id?: string;
  idempotency_key?: string;
  package_format?: 'full' | 'incremental';
  since_version?: number;
  worker_ids?: string[];
  /**
   * When true: generate a `per_device_v1` envelope for each device in `devices` that has
   * `device_key_b64` set.  Mutually exclusive with `site_master_v1` — the master key is still
   * used to derive `dataKey` but each device gets its own wrapped copy of that key.
   */
  use_per_device_keys?: boolean;
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
  if (!supabaseUrl || !anonKey) {
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

  const siteId = body.site_id?.trim();
  if (!siteId) {
    return json(400, { error: 'site_id_required' });
  }

  const idemHeader = req.headers.get('Idempotency-Key')?.trim();
  const idempotencyKey = (body.idempotency_key ?? idemHeader ?? '').trim().slice(0, MAX_IDEMPOTENCY_KEY_LEN);
  const packageFormat = body.package_format === 'incremental' ? 'incremental' : 'full';

  if (packageFormat === 'incremental' && (!body.worker_ids || body.worker_ids.length === 0)) {
    return json(400, { error: 'incremental_requires_worker_ids' });
  }

  const { data: site, error: siteErr } = await userClient
    .from('sites')
    .select('id, supervisor_id, package_version')
    .eq('id', siteId)
    .maybeSingle();

  if (siteErr || !site) {
    return json(404, { error: 'site_not_found' });
  }

  const pehchaanRole = String(user.app_metadata?.pehchaan_role ?? '').toLowerCase().trim();
  const isAdmin = pehchaanRole === 'admin';
  if (!isAdmin && site.supervisor_id !== user.id) {
    return json(403, { error: 'forbidden_not_supervisor_for_site' });
  }

  const masterB64 = Deno.env.get('SITE_PACKAGE_MASTER_KEY')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';

  if (masterB64) {
    if (!serviceKey) {
      return json(500, { error: 'service_role_required_when_site_package_master_key_set' });
    }
    return await buildEncryptedPackage({
      masterB64,
      admin: createClient(supabaseUrl, serviceKey),
      siteId,
      site,
      idempotencyKey,
      packageFormat,
      workerIds: body.worker_ids,
      sinceVersion: body.since_version,
      usePerDeviceKeys: body.use_per_device_keys === true,
    });
  }

  return await buildPlainPackage({
    userClient,
    siteId,
    site,
  });
});

async function buildPlainPackage(args: {
  userClient: ReturnType<typeof createClient>;
  siteId: string;
  site: { id: string; supervisor_id: string; package_version: number | null };
}): Promise<Response> {
  const { userClient, siteId, site } = args;
  const { data: workerRows, error: wErr } = await userClient
    .from('workers')
    .select(
      'id, name, role, site_id, reference_thumbnail_url, enrolled_at, revoked_at, language_preference',
    )
    .eq('site_id', siteId);

  if (wErr) {
    return json(500, { error: 'workers_fetch_failed', detail: wErr.message });
  }

  const nextVersion = (site.package_version ?? 0) + 1;
  const manifest = {
    version: 1,
    cipher: 'none',
    generated_at: new Date().toISOString(),
    site_id: siteId,
    workers: (workerRows ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      site_id: w.site_id,
      reference_thumbnail_url: w.reference_thumbnail_url,
      enrolled_at: w.enrolled_at,
      revoked_at: w.revoked_at,
      language_preference: w.language_preference ?? 'en',
    })),
  };

  const zipBody = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
  });

  const objectPath = `${siteId}/${OBJECT_NAME}`;
  const { error: upErr } = await userClient.storage.from(SITE_PKG).upload(objectPath, zipBody, {
    contentType: 'application/zip',
    upsert: true,
  });
  if (upErr) {
    return json(500, { error: 'storage_upload_failed', detail: upErr.message });
  }

  const { error: insErr } = await userClient.from('site_packages').insert({
    site_id: siteId,
    version: nextVersion,
    storage_path: objectPath,
  });
  if (insErr) {
    return json(500, { error: 'site_packages_insert_failed', detail: insErr.message });
  }

  const { error: updErr } = await userClient.from('sites').update({ package_version: nextVersion }).eq('id', siteId);
  if (updErr) {
    return json(500, { error: 'sites_update_failed', detail: updErr.message });
  }

  return json(200, {
    ok: true,
    package_kind: 'v1_plain',
    site_id: siteId,
    version: nextVersion,
    storage_path: objectPath,
    worker_count: manifest.workers.length,
  });
}

async function buildEncryptedPackage(args: {
  masterB64: string;
  admin: ReturnType<typeof createClient>;
  siteId: string;
  site: { id: string; supervisor_id: string; package_version: number | null };
  idempotencyKey: string;
  packageFormat: 'full' | 'incremental';
  workerIds?: string[];
  sinceVersion?: number;
  usePerDeviceKeys: boolean;
}): Promise<Response> {
  const {
    admin,
    siteId,
    site,
    masterB64,
    idempotencyKey,
    packageFormat,
    workerIds,
    usePerDeviceKeys,
  } = args;

  if (idempotencyKey.length > 0) {
    const { data: prev, error: idemErr } = await admin
      .from('site_package_publish_idempotency')
      .select('response_json')
      .eq('site_id', siteId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (idemErr) {
      console.error('idempotency_lookup_failed', { site_id: siteId, code: idemErr.message });
    } else if (prev?.response_json) {
      return json(200, prev.response_json as Record<string, unknown>);
    }
  }

  let masterKey: Uint8Array;
  try {
    masterKey = decodeMasterKey(masterB64);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: 'invalid_site_package_master_key', detail: msg });
  }

  let wq = admin
    .from('workers')
    .select(
      'id, name, role, site_id, reference_thumbnail_url, enrolled_at, revoked_at, language_preference, embedding_encrypted',
    )
    .eq('site_id', siteId);

  if (packageFormat === 'incremental' && workerIds && workerIds.length > 0) {
    wq = wq.in('id', workerIds);
  }

  const { data: workerRows, error: wErr } = await wq;
  if (wErr) {
    console.error('workers_fetch_failed', { site_id: siteId, code: wErr.message });
    return json(500, { error: 'workers_fetch_failed' });
  }

  const rows = workerRows ?? [];
  if (rows.length > MAX_WORKERS) {
    return json(413, { error: 'too_many_workers', max: MAX_WORKERS });
  }

  const innerWorkers = rows.map((w) => ({
    id: w.id,
    name: w.name,
    role: w.role,
    site_id: w.site_id,
    language_preference: w.language_preference ?? 'en',
    enrolled_at: w.enrolled_at,
    revoked_at: w.revoked_at,
    reference_thumbnail_url: w.reference_thumbnail_url,
    embedding_encrypted_base64: byteaToBase64(w.embedding_encrypted),
    reference_thumbnail_base64: null as string | null,
  }));

  const innerObj = {
    inner_format_version: 1,
    site_id: siteId,
    workers: innerWorkers,
  };

  const innerUtf8 = new TextEncoder().encode(JSON.stringify(innerObj));
  if (innerUtf8.byteLength > MAX_INNER_BYTES) {
    return json(413, { error: 'inner_payload_too_large', max_bytes: MAX_INNER_BYTES });
  }

  const dataKey = randomBytes(32);
  const payloadBin = sealAesGcm256(dataKey, innerUtf8);
  const payloadSha = await sha256Hex(payloadBin);

  // --- key envelope ---
  let keyEnvelope: Record<string, unknown>;
  let deviceEnvelopes: Array<{ device_id: string; wrap_blob_b64: string }> | undefined;

  if (usePerDeviceKeys) {
    // Fetch all provisioned devices for this site that have a device key registered.
    const { data: deviceRows, error: devErr } = await admin
      .from('devices')
      .select('id, device_key_b64')
      .eq('site_id', siteId)
      .not('device_key_b64', 'is', null);
    if (devErr) {
      console.error('devices_fetch_failed', { site_id: siteId, code: devErr.message });
      return json(500, { error: 'devices_fetch_failed' });
    }
    deviceEnvelopes = [];
    for (const d of deviceRows ?? []) {
      if (!d.device_key_b64) { continue; }
      let deviceKey: Uint8Array;
      try {
        deviceKey = decodeMasterKey(d.device_key_b64);
      } catch {
        console.warn('skipping_device_bad_key', { device_id: d.id });
        continue;
      }
      const wrapBlob = sealAesGcm256(deviceKey, dataKey);
      deviceEnvelopes.push({ device_id: d.id, wrap_blob_b64: bytesToBase64(wrapBlob) });
    }
    if (deviceEnvelopes.length === 0) {
      return json(400, { error: 'use_per_device_keys_but_no_provisioned_devices' });
    }
    keyEnvelope = { kind: 'per_device_v1' };
  } else {
    const wrapBlob = sealAesGcm256(masterKey, dataKey);
    keyEnvelope = { kind: 'site_master_v1', wrap_blob_b64: bytesToBase64(wrapBlob) };
  }

  const nextVersion = (site.package_version ?? 0) + 1;
  const outer: Record<string, unknown> = {
    version: 2,
    cipher: 'aes-256-gcm',
    generated_at: new Date().toISOString(),
    site_id: siteId,
    package_version: nextVersion,
    package_format: packageFormat,
    previous_package_version: site.package_version ?? null,
    since_version: args.sinceVersion ?? null,
    key_envelope: keyEnvelope,
    ...(deviceEnvelopes ? { device_envelopes: deviceEnvelopes } : {}),
    workers_index: innerWorkers.map((w) => ({ id: w.id, name: w.name })),
    payload: {
      path: 'payload.bin',
      sha256: payloadSha,
      size_bytes: payloadBin.byteLength,
    },
  };

  const zipBody = zipSync({
    'manifest.json': strToU8(JSON.stringify(outer)),
    'payload.bin': payloadBin,
  });

  const objectPath = `${siteId}/${OBJECT_NAME}`;
  const { error: upErr } = await admin.storage.from(SITE_PKG).upload(objectPath, zipBody, {
    contentType: 'application/zip',
    upsert: true,
  });
  if (upErr) {
    console.error('storage_upload_failed', { site_id: siteId, code: upErr.message });
    return json(500, { error: 'storage_upload_failed' });
  }

  const { error: insErr } = await admin.from('site_packages').insert({
    site_id: siteId,
    version: nextVersion,
    storage_path: objectPath,
  });
  if (insErr) {
    console.error('site_packages_insert_failed', { site_id: siteId, code: insErr.message });
    return json(500, { error: 'site_packages_insert_failed' });
  }

  const { error: updErr } = await admin.from('sites').update({ package_version: nextVersion }).eq('id', siteId);
  if (updErr) {
    console.error('sites_update_failed', { site_id: siteId, code: updErr.message });
    return json(500, { error: 'sites_update_failed' });
  }

  const responseBody: Record<string, unknown> = {
    ok: true,
    package_kind: 'v2_encrypted',
    site_id: siteId,
    version: nextVersion,
    storage_path: objectPath,
    worker_count: innerWorkers.length,
    package_format: packageFormat,
  };

  if (idempotencyKey.length > 0) {
    const { error: idemInsErr } = await admin.from('site_package_publish_idempotency').insert({
      site_id: siteId,
      idempotency_key: idempotencyKey,
      package_version: nextVersion,
      storage_path: objectPath,
      response_json: responseBody,
    });
    if (idemInsErr) {
      console.error('idempotency_insert_failed', { site_id: siteId, code: idemInsErr.message });
    }
  }

  return json(200, responseBody);
}
