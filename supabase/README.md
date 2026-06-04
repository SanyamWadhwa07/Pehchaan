# Supabase (dev backend)

Apply migrations to your hosted project (requires [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
cd Pehchaan
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste `supabase/migrations/*.sql` in order into **SQL Editor** (Dashboard → SQL).

## Migrations

| File | Purpose |
|------|---------|
| `001_initial_schema.sql` | Seven domain tables + enums + RLS enabled |
| `002_rls_policies.sql` | Policies, JWT helpers, revoke `workers.embedding_encrypted` for clients |
| `003_storage_site_packages.sql` | Private `site-packages` bucket + `storage.objects` RLS (`{site_id}/…` keys) |
| `004_integration_outbox_and_site_packages_rls.sql` | `integration_attendance_outbox` + insert trigger; supervisor may `insert` `site_packages` |
| `005_site_package_publish_idempotency.sql` | Idempotency store for Edge publish (no client policies; **service_role** writes) |

## Edge Functions

| Function | Purpose |
|----------|---------|
| `create-site-package` | POST `{ "site_id", "idempotency_key"?, "package_format"?, "worker_ids"? }` with **supervisor JWT**. **v2 (encrypted):** requires secrets `SITE_PACKAGE_MASTER_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — builds inner JSON (incl. `embedding_encrypted` from DB), AES-256-GCM wrap, zip `manifest.json` + `payload.bin`, upload, DB bump. **v1:** plaintext manifest if master key unset. |

Deploy (requires CLI login + link):

```bash
npx supabase functions deploy create-site-package
```

**Secrets (v2):** set in Dashboard → Edge Functions → **Secrets** (see [`docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](../docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md)):

| Secret | Required for v2? |
|--------|---------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** — fetch `workers.embedding_encrypted`, idempotency table, Storage upload |
| `SITE_PACKAGE_MASTER_KEY` | **Yes** — base64 of 32 raw bytes; wraps per-publish random data key |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` are injected automatically. **v1** path uses supervisor JWT + RLS only (no service role).

Invoke from app or curl:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/create-site-package" \
  -H "Authorization: Bearer <supervisor_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"site_id":"<uuid>"}'
```

Policies use **`auth.jwt() -> 'app_metadata'`**:

| Key | Values | Notes |
|-----|--------|--------|
| `pehchaan_role` | `supervisor`, `device`, `admin` | Lowercased when read |
| `site_id` | UUID string | Required for **`device`** tokens |

**Supervisors** are also recognised when `sites.supervisor_id = auth.uid()` (no metadata required).

Set metadata in Dashboard → **Authentication** → user → **Raw App Meta Data**, e.g.:

```json
{
  "pehchaan_role": "admin"
}
```

```json
{
  "pehchaan_role": "device",
  "site_id": "00000000-0000-0000-0000-000000000000"
}
```

Use a **Custom Access Token Hook** in production so `site_id` / role cannot be forged by clients.

## Supervisor sign-in (React Native + RLS)

RLS treats a **supervisor** as anyone where `public.sites.supervisor_id = auth.uid()`.  
The JWT from `signInWithPassword` already includes `sub` (= user id); you do **not** need `app_metadata` for that path.

1. **Authentication → Providers:** enable **Email**.
2. **Authentication → Users:** create the user (e.g. `supervisor@test.com`) and set a **password** (or use “Send magic link” only if you implement magic link in the app).
3. **Link the user to a site** (SQL Editor — run as postgres / service context):

```sql
insert into public.sites (name, project_code, supervisor_id, package_version)
select
  'Demo NHAI Site',
  'DEMO-001',
  id,
  0
from auth.users
where email = 'supervisor@test.com'   -- use your real Auth email here
limit 1
returning id, supervisor_id;
```

4. In the app, call `signInWithPassword` on the client from `src/lib/supabase.ts` (add a login screen or temporary dev button).

Full Dashboard steps: **[supabase/DASHBOARD_SETUP.md](./DASHBOARD_SETUP.md)**.

Dev seed (sites / workers / devices): run **`supabase/seed/dev_supervisor_site_device.sql`** in SQL Editor after users exist.

### Verify RLS from your machine (no secrets in repo)

Set env vars in PowerShell, then:

```bash
npm run verify:auth-rls
```

Uses `TEST_EMAIL` / `TEST_PASSWORD` (supervisor). Optionally set `TEST_DEVICE_EMAIL` / `TEST_DEVICE_PASSWORD` for device + sample `attendance_records` insert.

The script signs in, runs `select` on `sites` and `workers` with the **anon** client (same as the app), and prints row counts. Expect at least one **site** whose `supervisor_id` equals the signed-in user id; otherwise run the seed SQL above.

**Optional** `app_metadata` for supervisors is only needed if you use policies that check `pehchaan_role`; table access for their site is already granted via `supervisor_id`.

## Device JWT (later)

Use **`app_metadata`** (`pehchaan_role: "device"`, `site_id: "<uuid>"`) or a **Custom Access Token Hook** so clients cannot forge `site_id`. Mint device-only users or short-lived tokens from an Edge Function; do not put `service_role` in the app.

## Bootstrap (first site + supervisor) — SQL Editor, service role

1. Create a user in **Authentication** (supervisor email).
2. Copy their UUID from the users list (or use the `insert ... select from auth.users where email = ...` snippet above).
3. Run (replace UUIDs and names if not using the email-based insert):

```sql
insert into public.sites (id, name, project_code, supervisor_id, package_version)
values (
  gen_random_uuid(),
  'Demo NHAI Site',
  'DEMO-001',
  '<SUPERVISOR_AUTH_USER_UUID>'::uuid,
  0
)
returning id;
```

4. Register a **device** row for that `site_id` (optional, for device JWT tests).
5. Insert **workers** / **registration_requests** as that supervisor via the app or SQL.

`service_role` bypasses RLS, so SQL Editor runs as admin for one-off seeds.

## `embedding_encrypted`

`authenticated` / `anon` **cannot** `SELECT` the column `workers.embedding_encrypted`. Embeddings are intended for **site package** / **service_role** pipelines only.
