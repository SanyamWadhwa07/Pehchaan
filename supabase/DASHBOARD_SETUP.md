# Supabase Dashboard — Auth & RLS checklist (Pehchaan)

Do these in the [Supabase Dashboard](https://supabase.com/dashboard) for your project, **before** verifying in the app or with `npm run verify:auth-rls`.

---

## 1. Authentication → Providers

- Enable **Email** provider.
- For hackathon dev: under **Email**, consider disabling **“Confirm email”** (or confirm the user’s email from the Auth UI) so `signInWithPassword` works immediately.

---

## 2. Supervisor user (`supervisor@test.com`)

1. **Authentication → Users → Add user** (or invite).
2. Set **email** and **password**.
3. **No** `app_metadata` required for supervisor RLS if you link them in `public.sites` (next step).

---

## 3. Link supervisor → `sites` (RLS)

In **SQL Editor**, run the statements in `supabase/seed/dev_supervisor_site_device.sql` (at least the **`sites` INSERT** block), or the snippet in `supabase/README.md` that inserts a site with `supervisor_id` = that user’s `id`.

Confirm:

```sql
select s.id, s.name, u.email
from public.sites s
join auth.users u on u.id = s.supervisor_id;
```

---

## 4. Device user — **Option A (MVP)**

1. **Authentication → Users → Add user**, e.g. `device@test.com` + password.

2. **`site_id` must be `public.sites.id`** — the site row’s UUID, **not** the device user’s Auth `id`.  
   Easiest: run **`supabase/seed/patch_device_app_metadata.sql`** in SQL Editor (or `npx supabase db query --linked -f supabase/seed/patch_device_app_metadata.sql`). It merges `pehchaan_role` + `site_id` for `device@test.com` from the site owned by `supervisor@test.com`.

3. **Or** edit the user in Dashboard → **Raw App Meta Data** — merge into existing JSON (keep `provider` / `providers`), e.g.:

```json
{
  "provider": "email",
  "providers": ["email"],
  "pehchaan_role": "device",
  "site_id": "<paste-uuid-from-select-id-from-public-sites>"
}
```

4. **Re-sign-in** after changing metadata so the new JWT is issued.

**Option B (production-style):** add a **Custom Access Token Hook** that sets `pehchaan_role` and `site_id` from your own table so users cannot edit metadata in the Dashboard.

---

## 5. Seed `workers` + `devices` (for attendance insert test)

Run the rest of `supabase/seed/dev_supervisor_site_device.sql` so there is at least:

- one **worker** on the supervisor’s site, and  
- one **devices** row for that site (used as `device_id` on `attendance_records`).

---

## 6. API keys for the app

- **Project Settings → API:** copy **Project URL** and **anon public** key into the app `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- Rebuild the native app after changing `.env` (`react-native-config`).

---

## 7. Local verification (optional)

From `Pehchaan/` (set secrets in the shell, do not commit):

```powershell
$env:SUPABASE_URL = "https://<ref>.supabase.co"
$env:SUPABASE_ANON_KEY = "<anon>"
$env:TEST_EMAIL = "supervisor@test.com"
$env:TEST_PASSWORD = "<password>"
$env:TEST_DEVICE_EMAIL = "device@test.com"
$env:TEST_DEVICE_PASSWORD = "<password>"
npm run verify:auth-rls
```

The script checks supervisor **sites/workers**, then device **sites/workers** and a sample **`attendance_records` INSERT** when seed data exists.
