# Pehchaan — Day 2 tasks (Anoushka track)

**Scope:** Site package builder (AES-256-GCM · zip · Storage), **local decrypt**, **WatermelonDB sync adapter**, **registration API endpoints** — as in [`Pehchaan_Implementation_Plan_v2.md`](../Pehchaan_Implementation_Plan_v2.md) § **DAY 2 — Core Auth Loop** (Anoushka rows).

**Day 1 only:** [`DAY1_PROGRESS.md`](./DAY1_PROGRESS.md) — do not mix Day 2 delivery into that file.

**Policies & secrets (hackathon):**

- [`SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](./SUPABASE_DASHBOARD_SECRETS_SAMPLE.md)
- [`POLICY_KEY_ROTATION.md`](./POLICY_KEY_ROTATION.md)
- [`POLICY_BIOMETRIC_RETENTION.md`](./POLICY_BIOMETRIC_RETENTION.md)

**Legend**

| Column | Meaning |
|--------|--------|
| **Done (repo)** | Implemented and typecheck-verified. May still need your deploy / mount. |
| **To do — you** | Human / product / ops: secrets, QA, mounting hooks, Dashboard steps. |

---

## Summary — all codebase tasks complete

| Theme | Status |
|-------|--------|
| Site package builder | ✅ Complete |
| Local decrypt | ✅ Complete |
| WMDB sync adapter | ✅ Complete |
| Registration APIs (repo layer) | ✅ Complete |
| Edge `register-worker` | ⏳ Remaining (see §4) |

---

## 1. Site package builder (AES-256-GCM · zip · Storage)

### Done (repo)

- Private bucket **`site-packages`** and `storage.objects` RLS (`003`).
- **`sitePackageStorage.ts`**, **`sitePackageManifest.ts`** (v1 + v2 outer/inner types + parser).
- **Edge `create-site-package`** (`supabase/functions/create-site-package/index.ts`):
  - **v2** when `SITE_PACKAGE_MASTER_KEY` + `SUPABASE_SERVICE_ROLE_KEY` set: fetch workers with `embedding_encrypted`, build inner JSON, AES-256-GCM data key + wrap, `payload.bin`, SHA-256, zip, upload, update `site_packages` + `sites.package_version`.
  - **v1 plaintext** fallback when master secret unset.
  - **Incremental** (`package_format: "incremental"` + `worker_ids[]`).
  - **Hardening**: `MAX_WORKERS`, `MAX_INNER_BYTES`, redacted error logs, idempotency table `005`.
  - **`per_device_v1` mode** (`use_per_device_keys: true`): fetches `devices.device_key_b64`, wraps data key per device, emits `device_envelopes[]`.
- Migration **`005`** — `site_package_publish_idempotency` table.
- Migration **`006`** — `devices.device_key_b64` column.

### To do — you

- Set Dashboard secrets per [`SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](./SUPABASE_DASHBOARD_SECRETS_SAMPLE.md).
- `npx supabase db push` for **`005`** and **`006`**, then `npx supabase functions deploy`.
- Legal sign-off per [`POLICY_BIOMETRIC_RETENTION.md`](./POLICY_BIOMETRIC_RETENTION.md).
- (Per-device) During device provisioning: generate 32-byte secret in app → Keychain → store `device_key_b64` in `devices` row via service-role or supervisor API.

---

## 2. Local decrypt (after download)

### Done (repo)

- **`decryptSitePackageV2Payload`** — unwrap + decrypt inner JSON; `bytesToBase64 / base64ToBytes`, `byteaFieldToBase64`.
- **`parseSitePackageFromZipBuffer`** — routes v1 vs v2.
- **`hydrateLocalWorkersFromSitePackage`** — v2 path persists `embedding_encrypted_base64` on `Worker`.
- **`SITE_PACKAGE_MASTER_KEY`** in `src/config/env.ts` + `.env.example` + typings.
- WatermelonDB **schema v2** migration (`embedding_encrypted_base64` column).
- **`SitePackageKeyMaterial`** union — `{ kind: 'site_master'; key32 }` | `{ kind: 'per_device'; deviceId; key32 }`.
- **`per_device_v1` decrypt** in `decryptSitePackageV2Payload`: finds device's envelope, unwraps data key.
- **`HydrateLocalWorkersOptions`** extended with `deviceId` + `deviceKeyBase64`.
- **Roundtrip test** `scripts/verify-site-package-roundtrip.mjs` — 4 groups, 20 assertions (`npm run verify:roundtrip` → 20/20 ✓).

### To do — you

- Rebuild native app after `.env` changes; keep master key out of public repos.
- `npx supabase db push` for migration **`006`** before using per-device packages.

---

## 3. WatermelonDB sync adapter

### Done (repo)

**Schema / models (v3)**

- WMDB `SCHEMA_VERSION = 3`. Migration `toVersion: 3` adds:
  - `attendance_records`: `retry_count` (number), `last_error_at` (number, optional).
  - `registration_requests`: `retry_count`, `last_error_at`, `server_record_id` (string, optional).
- `AttendanceRecordModel`: `retryCount`, `lastErrorAt` fields.
- `RegistrationRequestModel`: `retryCount`, `lastErrorAt`, `serverRecordId` fields.

**Attendance outbox** (`src/services/sync/attendanceOutboxSync.ts`)

- `pushPendingAttendanceOutbox(db, options?)` — batch uploads `pending` and backoff-eligible `failed` rows.
- **Exponential backoff**: base 30 s, doubles each attempt, capped at 1 h.
- **Dead-letter** at `ATTENDANCE_MAX_RETRIES = 5` — stops retrying; logs `fail_reason`.
- Marks rows `uploading` before the network call (crash-safe, no double-submit).
- On success: writes `server_record_id`, mirrors `sync_status` + `integration_push_status` from server, resets `retry_count`.

**Registration outbox** (`src/services/sync/registrationOutboxSync.ts`)

- `pushPendingRegistrationOutbox(db)` — uploads rows with `status = 'pending_registration'` and no `server_record_id`.
- **Backoff**: base 1 min, doubles, capped at 4 h.
- **Dead-letter** at `REGISTRATION_MAX_RETRIES = 4` — prefixes `review_note` with `[sync_dead_lettered ...]`.
- On success: writes `server_record_id`, mirrors server `status` (→ `'pending'`), resets backoff.
- RLS already allows device + supervisor roles to insert (`registration_insert_supervisor_or_device`).

**Sync scheduler** (`src/services/sync/syncScheduler.ts`)

- `createSyncScheduler(config)` — factory; `start()` returns cleanup function.
  - Triggers: **app foreground** (`AppState 'active'`) + **periodic timer** (default 5 min).
  - Runs both attendance and registration outbox via `Promise.allSettled`.
  - Deduped: a second call while running is a no-op.
- `useSyncScheduler(config)` — React hook wrapping the factory; returns `{ runSync }`.

### To do — you

- **Mount** `useSyncScheduler` in your device session root (e.g. `DeviceHomeScreen` or a session wrapper) after a successful device sign-in:

  ```tsx
  import { useSyncScheduler } from '@/services/sync';
  import { database } from '@/db';

  // Inside your device home / session root component:
  const { runSync } = useSyncScheduler({
    database,
    intervalMs: 5 * 60_000,           // 5 min background poll
    onSyncComplete: (r) => console.log('[sync]', r),
  });
  ```

- **Unmount** automatically on sign-out (hook cleanup runs when component unmounts).
- QA matrix: offline → create attendance → come online → verify outbox drains; kill + restart mid-upload → verify no duplicates.

---

## 4. Registration API endpoints

### Done (repo)

- Postgres table + `registration_status_enum` + RLS (`001`, `002`).
- **`registrationRepository.ts`** — `insertRegistrationRequest`, `fetchRegistrationRequestsForSite`.
- **`RegistrationRequestModel`** + WMDB schema v3 (with outbox columns).
- **`pushPendingRegistrationOutbox`** (see §3) — syncs locally queued registrations to server.

### Remaining — Cursor / codebase

- Edge **`register-worker`** function (or Postgres RPC) — server-side processing once a registration is accepted: create a `workers` row, optionally trigger enrollment pipeline.
  - This is separate from the outbox insert: the outbox only creates the `registration_requests` row (supervisor/admin review state); the Edge function would handle the final `workers` insert after admin approval.

### To do — you

- Confirm API contract with team: who triggers the worker creation — admin portal or Edge function?
- RLS review: only admin should be able to approve registrations and insert `workers`.

---

## Related paths

| Path | Notes |
|------|--------|
| `supabase/functions/create-site-package/index.ts` | v1 + v2 builder + per-device mode |
| `supabase/migrations/005_site_package_publish_idempotency.sql` | Idempotency store |
| `supabase/migrations/006_devices_device_key.sql` | `devices.device_key_b64` |
| `scripts/verify-site-package-roundtrip.mjs` | 20-assertion roundtrip test (`npm run verify:roundtrip`) |
| `src/services/sitePackage/decryptSitePackage.ts` | RN AES-GCM open + per-device decrypt |
| `src/services/sync/attendanceOutboxSync.ts` | Attendance outbox + backoff |
| `src/services/sync/registrationOutboxSync.ts` | Registration outbox + backoff |
| `src/services/sync/syncScheduler.ts` | AppState + timer triggers + `useSyncScheduler` hook |
| `src/db/schema.ts` | WMDB v3 schema |
| `docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md` | Sample secrets |
| `docs/POLICY_KEY_ROTATION.md` | Key rotation policy |
| `docs/POLICY_BIOMETRIC_RETENTION.md` | Biometric retention policy |

---

*Updated: Day 2 codebase tasks complete. Remaining: Edge `register-worker` + human-side mounting/QA.*
