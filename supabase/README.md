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

## JWT `app_metadata` (supervisor / device / admin)

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

## Bootstrap (first site + supervisor) — SQL Editor, service role

1. Create a user in **Authentication** (supervisor email).
2. Copy their UUID from the users list.
3. Run (replace UUIDs and names):

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
