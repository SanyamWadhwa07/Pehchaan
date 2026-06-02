# Pehchaan — Day 1 progress (NHAI Hackathon 7.0)

**Last updated:** 2026-06-02  
**Companion:** [DAY2_TASKS.md](./DAY2_TASKS.md) (Anoushka Day 2 — do not merge into this file) · [STORAGE_AND_WATERMELON_USER_TASKS.md](./STORAGE_AND_WATERMELON_USER_TASKS.md) · [README](../README.md) · [Implementation plan](../Pehchaan_Implementation_Plan_v2.md)

This file tracks **Day 1 only** (foundation: schema, RLS, auth shell, storage bucket, local DB schema, repos, verify script). **Site package AES builder, local decrypt, sync wiring, registration endpoints** live in **Day 2** — see [`DAY2_TASKS.md`](./DAY2_TASKS.md).

---

## At a glance

| Scope | Status |
|------|--------|
| **Anoushka Day 1 (this repo)** | **Complete** for foundation: Supabase **001–003**, seeds path, Auth + Zustand, WatermelonDB schema + models, repositories + Storage helpers, login shell, `verify-auth-rls`, README / Dashboard docs. |
| **Migration `004`** | **Day 2 prep** (integration outbox + supervisor `site_packages` insert) — tracked in [`DAY2_TASKS.md`](./DAY2_TASKS.md); not part of the Day 1 closure checklist. |
| **Plan gap (Day 1 text)** | **Keychain:** plan mentions Keychain; session persistence is **AsyncStorage** in `src/lib/supabase.ts`. Optional hardening. |
| **Full team Day 1 sprint** (plan § DAY 1 — Foundation) | **Not** all rows are in this repo (ML, TFLite bridge, camera, design system, etc.). |

---

## Verification — `npm run verify:auth-rls`

### How to run

The script uses **shell environment variables only** (it does not read React Native `.env`). From repo root (PowerShell example):

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_ANON_KEY = "<anon-public-jwt>"
$env:TEST_EMAIL = "<supervisor@...>"
$env:TEST_PASSWORD = "<password>"
# Optional — device path + attendance insert:
$env:TEST_DEVICE_EMAIL = "..."
$env:TEST_DEVICE_PASSWORD = "..."
npm run verify:auth-rls
```

Expect: supervisor sign-in → `sites` / `workers` reads; optional device sign-in → scoped reads + `attendance_records` insert.

### Example successful output (shape)

```text
Using SUPABASE_URL host: <project-ref>.supabase.co
[supervisor] OK uid= <uuid>
[supervisor] sites rows= 1 [...]
[supervisor] workers rows= 1
[device] OK uid= <uuid>
[device] sites rows= 1 [...]
[device] workers sample= 1
[device] attendance insert OK id= <uuid>
All checks finished.
```

**Interpretation:** supervisor JWT matches RLS for site-linked data; device JWT (`app_metadata.pehchaan_role` + `site_id`) allows site-scoped reads and attendance insert per `002_rls_policies.sql`.

---

## Completed tasks — Day 1 only (repo + your environment)

### Database & RLS (foundation)

- [x] **7 tables** — `001_initial_schema.sql` (`sites`, `workers`, `site_packages`, `devices`, `attendance_records`, `revocation_log`, `registration_requests`).
- [x] **RLS + helpers** — `002_rls_policies.sql` (supervisor via `sites.supervisor_id`, device via JWT `app_metadata`, admin path; `embedding_encrypted` not exposed to generic roles).
- [x] **Day 1 migrations** — `001`, `002`, `003` applied to hosted project (`db push`).
- [x] **Seed** — `supabase/seed/dev_supervisor_site_device.sql`.
- [x] **Device JWT (Option A)** — `supabase/seed/patch_device_app_metadata.sql` (or Dashboard) for `pehchaan_role` + `site_id`.

### Auth & app shell

- [x] `src/lib/supabase.ts` — client + AsyncStorage session.
- [x] `src/stores/authStore.ts` — Zustand + `subscribeAuthToStore` (single `onAuthStateChange`).
- [x] `src/components/AuthStoreRoot.tsx` + `App.tsx` — subscribe at root.
- [x] `src/hooks/useAuth.ts` — Zustand + `useShallow`.
- [x] `src/services/auth/authService.ts` — `login` / `logout`.
- [x] `AppNavigation` — i18n boot → session gate → `LoginStack` vs `RootNavigator`.
- [x] Login UI + sign-out on settings; i18n `en` / `hi` for auth strings.
- [x] `.env.example` + `react-native-config` + Android `dotenv.gradle` (see README).

### Storage & local DB (Day 1 scope)

- [x] `003_storage_site_packages.sql` — private bucket `site-packages`; object keys `{site_id}/...`.
- [x] WatermelonDB — `src/db/` (schema, models, `react-native-quick-sqlite@8.0.0`, `DatabaseProvider`).
- [x] Repositories — `src/repositories/` (explicit `select` lists; workers omit `embedding_encrypted`).
- [x] `src/services/sitePackage/sitePackageStorage.ts` — path helper, signed URL, upload, download (no AES builder here — Day 2).

### Docs & tooling

- [x] `supabase/README.md`, `supabase/DASHBOARD_SETUP.md`.
- [x] `scripts/verify-auth-rls.cjs` + `npm run verify:auth-rls`.

### Environment (your machine / hosted project)

- [x] `SUPABASE_URL` is API URL (`https://*.supabase.co`), not a dashboard HTML URL.
- [x] `.env` for native builds (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); rebuild after changes.
- [x] Test users (supervisor + device), site linkage, seeds applied on hosted DB.
- [x] Re-run **`verify:auth-rls`** after RLS/auth/seed changes (export vars in shell as above).

---

## Ongoing — human, hardware, ops

| Area | Notes |
|------|--------|
| Native rebuild | After every `.env` change. |
| Physical device | APK install, sign-in, camera path; JDK / Gradle (avoid JDK 25 with older Gradle if you hit toolchain errors). |
| iOS | Confirm `react-native-config` on Mac if shipping iOS. |
| Supabase Dashboard | Providers, users, keys; Custom Access Token Hook if leaving Option A metadata. |
| Secrets | Never commit `.env`; rotate anything exposed. |
| DB hygiene | Optional: remove test `attendance_records` rows created by verify script. |
| Keychain (optional) | Wire `react-native-keychain` for tokens when required by security review. |

**Nice-to-have:** device provisioning UX without shared passwords; CI for `verify:auth-rls` with repo secrets.

---

## Related paths (Day 1)

| Path | Purpose |
|------|---------|
| `supabase/migrations/001_*.sql` … `003_*.sql` | Schema, RLS, storage |
| `supabase/seed/*.sql` | Dev seed + metadata patch |
| `supabase/DASHBOARD_SETUP.md` | Dashboard steps |
| `scripts/verify-auth-rls.cjs` | RLS smoke test |
| `src/repositories/` | Supabase data access (foundation) |
| `src/stores/authStore.ts` | Session state |

**Day 2 (Anoushka):** [`DAY2_TASKS.md`](./DAY2_TASKS.md) — AES site package, decrypt, sync wiring, registration APIs, migration `004`, Edge `create-site-package` extensions.

---

*Internal progress doc — Day 1 only.*
