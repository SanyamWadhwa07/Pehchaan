# Pehchaan — Day 1 progress (NHAI Hackathon 7.0)

**Last updated:** 2026-06-02  
**Owner focus:** Anoushka — Supabase backend, auth, RLS, RN integration

---

## Verification output — `npm run verify:auth-rls`

Successful run (correct `SUPABASE_URL` = `https://jyrqpbewfbfpfirfuwnn.supabase.co`):

```text
> pehchaan@0.0.1 verify:auth-rls
> node scripts/verify-auth-rls.cjs

Using SUPABASE_URL host: jyrqpbewfbfpfirfuwnn.supabase.co
[supervisor] OK uid= 7adc6809-1d6d-4151-8bd2-e7cf235e82a1
[supervisor] sites rows= 1 [{"id":"a1bd38ee-b9c7-482b-ba8f-ac8e4dec429a","name":"DEMOSITE","supervisor_id":"7adc6809-1d6d-4151-8bd2-e7cf235e82a1"}]
[supervisor] workers rows= 1
[device] OK uid= abf27cf8-7bb0-40f7-8d0d-dd059ad6bcfe
[device] sites rows= 1 [{"id":"a1bd38ee-b9c7-482b-ba8f-ac8e4dec429a","name":"DEMOSITE"}]
[device] workers sample= 1
[device] attendance insert OK id= cadc7a02-2f2b-444b-8e35-d8d0be99cca7

All checks finished.
```

**Interpretation**

- Supervisor JWT → `sites` and `workers` visible per RLS.
- Device JWT (`app_metadata.pehchaan_role` + `site_id`) → same site scoped reads + **`attendance_records` INSERT** allowed.

---

## Completed tasks (repo + remote)

### Database & RLS

- [x] **7 tables** in `001_initial_schema.sql` (`sites`, `workers`, `site_packages`, `devices`, `attendance_records`, `revocation_log`, `registration_requests`).
- [x] **RLS policies + helpers** in `002_rls_policies.sql` (supervisor via `sites.supervisor_id`, device via JWT `app_metadata`, admin path, `embedding_encrypted` revoked for `anon`/`authenticated`).
- [x] Migrations applied to hosted Supabase (`db push`).
- [x] **Seed** `supabase/seed/dev_supervisor_site_device.sql` (site, worker, device row).
- [x] **Device metadata patch** `supabase/seed/patch_device_app_metadata.sql` (Option A).

### Auth & app shell

- [x] **`src/lib/supabase.ts`** — `createClient` + AsyncStorage session.
- [x] **`src/hooks/useAuth.ts`** — session + loading + `onAuthStateChange`.
- [x] **`src/services/auth/authService.ts`** — `login` / `logout`.
- [x] **`src/AppNavigation.tsx`** — i18n boot → auth gate → `LoginStack` vs `RootNavigator`.
- [x] **`src/screens/auth/LoginScreen.tsx`** + **`src/navigation/LoginStack.tsx`** — email/password sign-in.
- [x] **Sign out** on Settings screen.
- [x] **i18n** strings for login / sign out (`en`, `hi`).
- [x] **`.env.example`** + **`react-native-config`** + Android `dotenv.gradle` (documented in README).

### Docs & tooling

- [x] `supabase/README.md`, **`supabase/DASHBOARD_SETUP.md`** (Dashboard checklist).
- [x] **`scripts/verify-auth-rls.cjs`** + `npm run verify:auth-rls`.

### Local / your environment (done once)

- [x] Correct **Project URL** (`*.supabase.co`, not dashboard link).
- [x] `.env` with `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- [x] Auth users **supervisor** + **device**, site linkage, verify script green.

---

## Day 1 remaining (from implementation plan)

### Can be done in-repo (agent / codebase)

| Task | Notes |
|------|--------|
| **Storage bucket + policies** | Migration or SQL: e.g. `site-packages` bucket, RLS for `storage.objects` aligned with `site_packages.storage_path`. |
| **WatermelonDB** | Schema + models for workers, attendance queue, registration queue per plan. |
| **README / setup** | Short “Day 1 done” checklist link from main README. |
| **Optional** | Edge stub for `create-site-package` placeholder; trigger to lock `integration_push_status` on `attendance_records`. |

### Needs you (human / dashboard / hardware)

| Task | Notes |
|------|--------|
| **Rebuild native app** | After every `.env` change (`react-native-config` reads at build time). |
| **Physical device checks** | Install APK, sign in, camera path, JDK/`JAVA_HOME` if Gradle fails (avoid JDK 25 for Gradle 8.3). |
| **Supabase Dashboard** | New environments: providers, users, keys; **Custom Access Token Hook** if you move off Option A device metadata. |
| **Secrets hygiene** | Rotate any password pasted in chat; never commit `.env` or `.env.verify.local`. |
| **Optional cleanup** | Delete test `attendance_records` row from verify script if you want a clean DB. |

### Day 1 “nice to have” (can slip to Day 2)

- Full **device provisioning** UX (no passwords in field).
- **iOS** `react-native-config` / env wiring if not already verified on Mac.
- **CI** for `verify:auth-rls` using GitHub secrets (you maintain secrets in repo settings).

---

## Related paths

| Path | Purpose |
|------|---------|
| `supabase/migrations/001_initial_schema.sql` | Tables |
| `supabase/migrations/002_rls_policies.sql` | RLS |
| `supabase/seed/*.sql` | Dev seed + device metadata patch |
| `supabase/DASHBOARD_SETUP.md` | Manual Supabase steps |
| `scripts/verify-auth-rls.cjs` | CLI RLS smoke test |

---

*Internal progress doc — update as Day 1 closes.*
