/**
 * RLS checks: supervisor session, then optional device session + attendance insert.
 *
 *   $env:SUPABASE_URL / $env:SUPABASE_ANON_KEY
 *   $env:TEST_EMAIL / $env:TEST_PASSWORD          (supervisor)
 *   $env:TEST_DEVICE_EMAIL / $env:TEST_DEVICE_PASSWORD  (optional, device user with app_metadata)
 *
 *   node scripts/verify-auth-rls.cjs
 */

const { createClient } = require('@supabase/supabase-js');

/** Trim + strip BOM / stray CR (common when copying from .env on Windows). */
function envTrim(name) {
  const v = process.env[name];
  if (!v) {
    console.error('Missing env:', name);
    process.exit(1);
  }
  return String(v).trim().replace(/^\uFEFF/, '').replace(/\r$/, '');
}

function normalizeSupabaseUrl(raw) {
  const u = raw.replace(/\/+$/, '');
  let host = '';
  try {
    host = new URL(u).hostname;
  } catch {
    console.error('SUPABASE_URL is not a valid URL:', raw.slice(0, 60) + (raw.length > 60 ? '…' : ''));
    process.exit(1);
  }
  if (u.includes('supabase.com/dashboard')) {
    console.error(
      'SUPABASE_URL looks like a Dashboard link. Use Project Settings → API → Project URL, e.g. https://abcd1234.supabase.co',
    );
    process.exit(1);
  }
  if (!/\.supabase\.co$/i.test(host) && !host.includes('127.0.0.1') && host !== 'localhost') {
    console.warn('SUPABASE_URL host is not *.supabase.co — if sign-in fails, double-check the URL.');
  }
  return u;
}

async function runSupervisor(client) {
  const email = envTrim('TEST_EMAIL');
  const password = envTrim('TEST_PASSWORD');

  const { data: auth, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !auth.user) {
    const msg = error?.message ?? 'no user';
    if (msg.includes('DOCTYPE') || msg.includes('JSON')) {
      console.error(
        '[supervisor] sign-in failed (got HTML instead of JSON). Your SUPABASE_URL is almost certainly wrong.',
      );
      console.error('  Use: https://<project-ref>.supabase.co  (from Dashboard → Settings → API)');
      console.error('  Not: supabase.com/dashboard/...');
    }
    console.error('[supervisor] sign-in failed:', msg);
    process.exit(1);
  }
  console.log('[supervisor] OK uid=', auth.user.id);

  const { data: sites, error: sErr } = await client.from('sites').select('id, name, supervisor_id');
  if (sErr) {
    console.error('[supervisor] sites:', sErr.message);
    process.exit(1);
  }
  console.log('[supervisor] sites rows=', sites?.length ?? 0, JSON.stringify(sites));

  const { data: workers, error: wErr } = await client.from('workers').select('id, name, site_id');
  if (wErr) {
    console.error('[supervisor] workers:', wErr.message);
    process.exit(1);
  }
  console.log('[supervisor] workers rows=', workers?.length ?? 0);

  await client.auth.signOut();
}

async function runDevice(client) {
  const email = process.env.TEST_DEVICE_EMAIL?.trim()?.replace(/\r$/, '');
  const password = process.env.TEST_DEVICE_PASSWORD?.trim()?.replace(/\r$/, '');
  if (!email || !password) {
    console.log('[device] skip (set TEST_DEVICE_EMAIL + TEST_DEVICE_PASSWORD to test)');
    return;
  }

  const { data: auth, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !auth.user) {
    console.error('[device] sign-in failed:', error?.message);
    process.exit(1);
  }
  console.log('[device] OK uid=', auth.user.id);

  const { data: sites, error: sErr } = await client.from('sites').select('id, name');
  if (sErr) {
    console.error('[device] sites:', sErr.message);
    process.exit(1);
  }
  console.log('[device] sites rows=', sites?.length ?? 0, JSON.stringify(sites));

  const { data: workers, error: wErr } = await client.from('workers').select('id, name, site_id').limit(5);
  if (wErr) {
    console.error('[device] workers:', wErr.message);
    process.exit(1);
  }
  console.log('[device] workers sample=', workers?.length ?? 0);

  const siteId = sites?.[0]?.id;
  if (!siteId) {
    console.warn('[device] no site — fix app_metadata site_id or seed sites');
    await client.auth.signOut();
    return;
  }

  const { data: devRows, error: dErr } = await client
    .from('devices')
    .select('id, site_id')
    .eq('site_id', siteId)
    .limit(1);
  if (dErr) {
    console.error('[device] devices select:', dErr.message);
    process.exit(1);
  }
  const deviceId = devRows?.[0]?.id;
  const workerId = workers?.[0]?.id;
  if (!deviceId || !workerId) {
    console.warn('[device] skip attendance insert (need devices + workers rows for site). Run seed SQL.');
    await client.auth.signOut();
    return;
  }

  const row = {
    worker_id: workerId,
    site_id: siteId,
    device_id: deviceId,
    auth_timestamp: new Date().toISOString(),
    liveness_passed: true,
    supervisor_confirmed: false,
  };

  const { data: ins, error: iErr } = await client.from('attendance_records').insert(row).select('id');
  if (iErr) {
    console.error('[device] attendance insert:', iErr.message, iErr);
    process.exit(1);
  }
  console.log('[device] attendance insert OK id=', ins?.[0]?.id);

  await client.auth.signOut();
}

async function main() {
  const url = normalizeSupabaseUrl(envTrim('SUPABASE_URL'));
  const key = envTrim('SUPABASE_ANON_KEY');
  if (!key.startsWith('eyJ')) {
    console.warn('SUPABASE_ANON_KEY does not look like a JWT (eyJ...). Paste the anon public key from Dashboard → API.');
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Using SUPABASE_URL host:', new URL(url).hostname);

  await runSupervisor(client);
  await runDevice(client);
  console.log('\nAll checks finished.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
