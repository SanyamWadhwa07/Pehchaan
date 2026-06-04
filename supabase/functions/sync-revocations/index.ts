/**
 * POST JSON body (all optional except implied site from JWT for devices):
 *   `site_id` — defaults to `app_metadata.site_id` (device must match JWT).
 *   `since` — ISO timestamp; revocations strictly after this instant are returned.
 *             If omitted, uses `devices.last_sync_at` when `device_id` is provided, else epoch.
 *   `device_id` — when present, used for `since` default and optional `last_sync_at` bump.
 *
 * Auth: Bearer JWT — **device** role only (field terminals). `verify_jwt = true` in config.toml.
 *
 * Response: `{ revocations: Array<{ worker_id, revoked_at, reason? }> }`
 * Reasons are truncated server-side; logs avoid raw PII.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const REASON_MAX = 200;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function redactReason(raw: string | null | undefined): string | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const t = raw.trim().replace(/\s+/g, ' ');
  return t.length > REASON_MAX ? `${t.slice(0, REASON_MAX)}…` : t;
}

type RequestBody = {
  site_id?: string;
  since?: string;
  device_id?: string;
};

type RevEntry = { worker_id: string; revoked_at: string; reason?: string };

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
    console.error('sync_revocations_config_missing');
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

  const role = String(user.app_metadata?.pehchaan_role ?? '').toLowerCase().trim();
  if (role !== 'device') {
    return json(403, { error: 'forbidden_device_role_required' });
  }

  const jwtSite = String(user.app_metadata?.site_id ?? '').trim();
  if (!jwtSite) {
    return json(403, { error: 'forbidden_missing_site_claim' });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const siteId = (body.site_id ?? jwtSite).trim();
  if (siteId !== jwtSite) {
    console.error('sync_revocations_site_mismatch');
    return json(403, { error: 'forbidden_site_mismatch' });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let sinceIso = (body.since ?? '').trim();
  if (!sinceIso && body.device_id?.trim()) {
    const { data: dev, error: devErr } = await admin
      .from('devices')
      .select('last_sync_at')
      .eq('id', body.device_id.trim())
      .eq('site_id', siteId)
      .maybeSingle();
    if (devErr) {
      console.error('sync_revocations_device_lookup_failed', { code: devErr.code });
      return json(500, { error: 'device_lookup_failed' });
    }
    sinceIso = (dev?.last_sync_at as string | null)?.trim() ?? '';
  }
  if (!sinceIso) {
    sinceIso = '1970-01-01T00:00:00.000Z';
  }

  const sinceMs = Date.parse(sinceIso);
  const fallbackMs = Number.isFinite(sinceMs) ? sinceMs : Date.parse('1970-01-01T00:00:00.000Z');
  const minWindowMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const sinceEffective = new Date(Math.max(fallbackMs, minWindowMs)).toISOString();

  const { data: logs, error: logErr } = await admin
    .from('revocation_log')
    .select('worker_id, revoked_at, reason')
    .eq('site_id', siteId)
    .gt('revoked_at', sinceEffective)
    .order('revoked_at', { ascending: true });

  if (logErr) {
    console.error('sync_revocations_query_failed', { code: logErr.code });
    return json(500, { error: 'query_failed' });
  }

  const { data: workers, error: wErr } = await admin
    .from('workers')
    .select('id, revoked_at')
    .eq('site_id', siteId)
    .gt('revoked_at', sinceEffective);

  if (wErr) {
    console.error('sync_revocations_workers_query_failed', { code: wErr.code });
    return json(500, { error: 'query_failed' });
  }

  const byWorker = new Map<string, RevEntry>();

  for (const row of logs ?? []) {
    const wid = String(row.worker_id ?? '').trim();
    if (!wid) continue;
    const ra = String(row.revoked_at ?? '').trim();
    if (!ra) continue;
    const prev = byWorker.get(wid);
    const reason = redactReason(row.reason as string | null | undefined);
    if (!prev || ra > prev.revoked_at) {
      byWorker.set(wid, { worker_id: wid, revoked_at: ra, reason });
    }
  }

  for (const row of workers ?? []) {
    const wid = String(row.id ?? '').trim();
    if (!wid) continue;
    const ra = String(row.revoked_at ?? '').trim();
    if (!ra) continue;
    const prev = byWorker.get(wid);
    if (!prev || ra > prev.revoked_at) {
      byWorker.set(wid, { worker_id: wid, revoked_at: ra });
    }
  }

  const revocations = [...byWorker.values()].sort((a, b) =>
    a.revoked_at.localeCompare(b.revoked_at),
  );

  if (body.device_id?.trim()) {
    const did = body.device_id.trim();
    const { error: bumpErr } = await admin
      .from('devices')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', did)
      .eq('site_id', siteId);
    if (bumpErr) {
      console.error('sync_revocations_last_sync_bump_failed', { code: bumpErr.code });
    }
  }

  return json(200, { revocations });
});
