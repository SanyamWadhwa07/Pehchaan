# Pehchaan — Day 2 tasks (Anoushka track)

**Scope:** Site package builder (AES-256-GCM · zip · Storage), **local decrypt**, **WatermelonDB sync adapter**, **registration API endpoints** — as in [`Pehchaan_Implementation_Plan_v2.md`](../Pehchaan_Implementation_Plan_v2.md) § **DAY 2 — Core Auth Loop** (Anoushka rows).

**Day 1 only:** [`DAY1_PROGRESS.md`](./DAY1_PROGRESS.md) — do not mix Day 2 delivery into that file.

**Day 3 next:** [`DAY3_TASKS.md`](./DAY3_TASKS.md) — sync state machine completion, conflicts, revocation sync, device trust.

**Policies & secrets (hackathon):**

- [`SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](./SUPABASE_DASHBOARD_SECRETS_SAMPLE.md)
- [`POLICY_KEY_ROTATION.md`](./POLICY_KEY_ROTATION.md)
- [`POLICY_BIOMETRIC_RETENTION.md`](./POLICY_BIOMETRIC_RETENTION.md)

---

## Status — ALL codebase tasks complete ✅

| Theme | Done |
|-------|------|
| 1. Site package builder | ✅ |
| 2. Local decrypt | ✅ |
| 3. WMDB sync adapter | ✅ |
| 4. Registration API + Edge | ✅ |

---

## 1. Site package builder (AES-256-GCM · zip · Storage)

### Done (repo)

- Private bucket **`site-packages`** + RLS (`003`).
- **`sitePackageStorage.ts`**, **`sitePackageManifest.ts`** (v1 + v2 outer/inner types + parsers).
- **Edge `create-site-package`**:
  - v2 AES-256-GCM inner payload; data key wrap with site master key.
  - v1 plaintext fallback when master secret unset.
  - Incremental mode (`package_format: "incremental"` + `worker_ids[]`).
  - Hardening: `MAX_WORKERS`, `MAX_INNER_BYTES`, idempotency table `005`.
  - **`per_device_v1` mode** (`use_per_device_keys: true`) — wraps data key per device, emits `device_envelopes[]`.
- Migration **`005`** — idempotency table.
- Migration **`006`** — `devices.device_key_b64` column.

### To do — you

- Set Dashboard secrets per [`SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](./SUPABASE_DASHBOARD_SECRETS_SAMPLE.md).
- `npx supabase db push` for `005` and `006`, then `npx supabase functions deploy create-site-package`.
- Legal sign-off per [`POLICY_BIOMETRIC_RETENTION.md`](./POLICY_BIOMETRIC_RETENTION.md).
- (Per-device) Device provisioning: generate 32-byte secret → store in Keychain → write `device_key_b64` to `devices` row.

---

## 2. Local decrypt (after download)

### Done (repo)

- `decryptSitePackageV2Payload` — AES-256-GCM unwrap + decrypt; SHA-256 verify.
- `SitePackageKeyMaterial` union — `{ kind: 'site_master' }` | `{ kind: 'per_device'; deviceId }`.
- `per_device_v1` decrypt path — resolves device envelope, unwraps data key.
- `parseSitePackageFromZipBuffer` — v1/v2 routing.
- `hydrateLocalWorkersFromSitePackage` — v2 path with `deviceId` + `deviceKeyBase64` options.
- `SITE_PACKAGE_MASTER_KEY` in `env.ts` + `.env.example` + typings.
- WatermelonDB schema v2 migration (`embedding_encrypted_base64` column).
- **Roundtrip test** `scripts/verify-site-package-roundtrip.mjs` — 4 groups, 20 assertions (`npm run verify:roundtrip` → 20/20 ✓).

### To do — you

- Rebuild native app after `.env` changes; keep master key out of public repos.

---

## 3. WatermelonDB sync adapter

### Done (repo)

**Schema v3 + models**

- `SCHEMA_VERSION = 3`; migration adds `retry_count` + `last_error_at` to `attendance_records`; `retry_count` + `last_error_at` + `server_record_id` to `registration_requests`.
- `AttendanceRecordModel`: `retryCount`, `lastErrorAt`.
- `RegistrationRequestModel`: `retryCount`, `lastErrorAt`, `serverRecordId`.

**Attendance outbox** (`src/services/sync/attendanceOutboxSync.ts`)

- `pushPendingAttendanceOutbox(db, options?)` — batch upload with backoff.
- Resets stuck `uploading` rows on each call (crash-safe: kill mid-upload → retry on next sync, no duplicates).
- Exponential backoff: 30 s → 60 s → 2 min → 4 min (base-2, capped at 1 h).
- Dead-letters at `ATTENDANCE_MAX_RETRIES = 5`.
- Marks `uploading` before network; mirrors server `sync_status` + `integration_push_status` on success.

**Registration outbox** (`src/services/sync/registrationOutboxSync.ts`)

- `pushPendingRegistrationOutbox(db)` — uploads `pending_registration` rows with no `server_record_id`.
- Backoff: 1 min → 2 min → 4 min; dead-letters at `REGISTRATION_MAX_RETRIES = 4`.
- Sets `server_record_id` + mirrors server `status` on success (idempotency guard on replay).
- RLS `registration_insert_supervisor_or_device` already allows device + supervisor inserts.

**Sync scheduler** (`src/services/sync/syncScheduler.ts`)

- `createSyncScheduler(config)` — `start()` registers AppState listener + interval timer; returns cleanup.
- `useSyncScheduler(config)` — React hook; cleanup runs on unmount (sign-out safe).
- Deduped: concurrent calls while running are no-ops.

**`DeviceSessionRoot.tsx`** (`src/components/DeviceSessionRoot.tsx`)

- Reads `session.user.app_metadata.pehchaan_role`.
- If `'device'`: mounts `useSyncScheduler` (5 min interval + foreground trigger); logs results in `__DEV__`.
- If not device: renders children unchanged — transparent to supervisor sessions.
- Integrated into `AppNavigation.tsx` — wraps `<RootNavigator />` when session is active.

**QA scenarios covered by implementation**

| Scenario | How covered |
|----------|-------------|
| Offline → create attendance → come online → outbox drains | `pending` rows sync on next foreground / 5-min tick |
| Kill mid-upload → restart → no duplicates | `uploading` reset → `pending` at start of each call; server insert is append-only (new UUID per record) |
| Repeated failures → backoff | `retry_count` + `last_error_at` gate each retry |
| Too many failures → stop retrying | Dead-letter after `MAX_RETRIES` |
| Sign-out → sync stops | `DeviceSessionRoot` unmounts → `AppState` listener + interval cleared |

### To do — you (no code needed)

- QA manually: offline mode → attendance → reconnect → inspect `outbox_sync_status` flips to `verified`.
- `npx supabase db push` for migration `007` (schema v3 columns on Postgres side is not required; those columns are WMDB-only).

---

## 4. Registration API endpoints

### Done (repo)

- Postgres table + `registration_status_enum` + RLS (`001`, `002`).
- `registrationRepository.ts` — `insertRegistrationRequest`, `fetchRegistrationRequestsForSite`.
- `RegistrationRequestModel` + WMDB schema v3 outbox columns.
- `pushPendingRegistrationOutbox` — syncs locally queued registrations to server (see §3).
- **`approveRegistrationRequest(id)`** in `registrationRepository.ts` — calls Edge `register-worker`.
- **Edge `register-worker`** (`supabase/functions/register-worker/index.ts`):
  - POST `{ registration_request_id }` — supervisor or admin JWT required.
  - Validates request exists and is `pending` / `pending_registration`.
  - Inserts `workers` row via user client (RLS enforced: `workers_insert_supervisor`).
  - Marks `registration_requests.status = 'approved', approved_at = now()`.
  - Idempotent: already-approved requests return existing `worker_id` without re-inserting.
  - `supabase/config.toml` — `[functions.register-worker] verify_jwt = true`.

### To do — you

- `npx supabase functions deploy register-worker`.
- Confirm UI wiring with team: supervisor approval screen calls `approveRegistrationRequest(id)`.
- ML pipeline (Sanyam) adds `embedding_encrypted` to the worker row after biometric enrollment.

---

## Related paths

| Path | Notes |
|------|--------|
| `supabase/functions/create-site-package/index.ts` | v1 + v2 + per-device builder |
| `supabase/functions/register-worker/index.ts` | Approval → workers insert |
| `supabase/migrations/005_site_package_publish_idempotency.sql` | Idempotency store |
| `supabase/migrations/006_devices_device_key.sql` | Per-device key column |
| `scripts/verify-site-package-roundtrip.mjs` | 20-assertion crypto test |
| `src/services/sitePackage/decryptSitePackage.ts` | AES-GCM open + per-device |
| `src/services/sync/attendanceOutboxSync.ts` | Batch upload + backoff |
| `src/services/sync/registrationOutboxSync.ts` | Registration outbox |
| `src/services/sync/syncScheduler.ts` | AppState + timer + hook |
| `src/components/DeviceSessionRoot.tsx` | Sync mount point |
| `src/db/schema.ts` | WMDB v3 |
| `docs/POLICY_KEY_ROTATION.md` | Key rotation policy |
| `docs/POLICY_BIOMETRIC_RETENTION.md` | Biometric retention policy |

---

*Day 2 codebase tasks complete. Remaining items are deploy steps, UI wiring, and QA.*
