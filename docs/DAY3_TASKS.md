# Pehchaan — Day 3 tasks (Anoushka track)

**Scope:** **Sync state machine** (5 states, exponential backoff, purge-after-ACK), **conflict resolution**, **revocation sync**, **device trust scoring** — aligned with [`Pehchaan_Implementation_Plan_v2.md`](../Pehchaan_Implementation_Plan_v2.md) § **DAY 3 — Offline Reliability & Sync** and Tier 1 items (conflict + trust).

**Prior days:** [`DAY1_PROGRESS.md`](./DAY1_PROGRESS.md) (foundation) · [`DAY2_TASKS.md`](./DAY2_TASKS.md) (site package, decrypt, outbox v1, registration Edge)

**Policies (still relevant):** [`POLICY_KEY_ROTATION.md`](./POLICY_KEY_ROTATION.md) · [`POLICY_BIOMETRIC_RETENTION.md`](./POLICY_BIOMETRIC_RETENTION.md)

**Legend**

| Column | Meaning |
|--------|--------|
| **Done (repo)** | Implemented in this repo. |
| **To do — you** | Human / product / ops: QA, Dashboard, device testing, team coordination. |

---

## Summary

| Theme | Day 2 baseline | Day 3 goal | Status |
|-------|----------------|------------|--------|
| Sync state machine (5 states + backoff) | Attendance outbox + backoff + stuck-`uploading` reset | **`purged` + env policy**; **reconcile**; **NetInfo**; [`SYNC_STATE_MACHINE.md`](./SYNC_STATE_MACHINE.md); [`QA_MULTI_DEVICE_SYNC.md`](./QA_MULTI_DEVICE_SYNC.md) | **Done (repo)** |
| Conflict resolution | Batch insert + server IDs | **`client_event_id`** + idempotent RPC; WMDB column; docs | **Done (repo)** |
| Revocation sync | `revocation_log` + RLS; local flags from site package | **Edge `sync-revocations`** + app poll → WMDB revoke + clear embedding | **Done (repo)** |
| Device trust scoring | `devices.trust_score` column exists | Scoring inputs / persistence / consumer | **Not done** (Day 3 repo scope — see §4) |

---

## 1. Sync state machine (5 states · exponential backoff · purge-after-ACK)

### Done (repo) — Day 2 baseline

- `pushPendingAttendanceOutbox` — batch upload; exponential backoff + dead-letter; stuck-`uploading` reset.

### Done (repo) — Day 3 extension

- **`purged` path:** after each successful batch insert, local row is updated using **`computeLocalAttendanceMirrorFromRemote`**: sets `purged_at` when policy moves row to **`purged`** (tombstone — row **not** deleted).
- **Purge policy (env):** `ATTENDANCE_PURGE_AFTER_INTEGRATION` in `.env` / `.env.example` — `true` = wait for `integration_push_status` in `{ pushed, not_applicable }` before local `purged`; unset/false = **`immediate_after_verified`** (default).
- **Remote reconcile:** `fetchAttendanceRecordsByIds` + **`reconcileAttendanceFromServer`** — pulls server rows for all local `server_record_id` on the device `site_id` and reapplies mirror (integration updates, rare server edits).
- **Scheduler:** `createSyncScheduler` accepts **`siteId`** and optional **`deviceId`**; runs **`syncRevocationsFromServer`** then reconcile after push batch; **`DeviceSessionRoot`** passes `app_metadata.site_id` and **`app_metadata.device_id`** when set.
- **NetInfo:** `@react-native-community/netinfo` — **`runSync()`** when connection becomes available (in addition to AppState + interval).
- **Docs:** [`docs/SYNC_STATE_MACHINE.md`](./SYNC_STATE_MACHINE.md) (transitions + **team decision log** table). **JSDoc** at top of `attendanceOutboxSync.ts` points here + [`OFFLINE_IDEMPOTENCY.md`](./OFFLINE_IDEMPOTENCY.md).
- **QA template:** [`docs/QA_MULTI_DEVICE_SYNC.md`](./QA_MULTI_DEVICE_SYNC.md) — scenarios + tables to fill during device testing.

### To do — you

- **Rebuild native** after `npm install` (NetInfo has native code): `cd android && ./gradlew clean` (or Android Studio sync) / `pod install` in `ios` if needed, then run the app.
- Run and **fill in** [`docs/QA_MULTI_DEVICE_SYNC.md`](./QA_MULTI_DEVICE_SYNC.md); paste summary to team chat.
- **Team decision:** record purge default in [`docs/SYNC_STATE_MACHINE.md`](./SYNC_STATE_MACHINE.md) § *Team decision log* after you align with Maulik / integration owner.

---

## 2. Conflict resolution

### Done (repo)

- Server-generated UUID per `attendance_records` insert; local `server_record_id` after successful batch.
- Idempotency table for **site package publish** (`005`) — pattern reference for other flows.
- **Postgres:** migration **`007_attendance_client_event_id_and_idempotent_rpc.sql`** — nullable `client_event_id`, unique index, RPC **`insert_attendance_batch_idempotent(p_rows jsonb)`** (returns existing row on conflict — no 500).
- **WMDB:** schema **v4** — `attendance_records.client_event_id`; assigned on first transition to `uploading`; sent on every retry.
- **App:** `insertAttendanceRecordsBatch` / `insertAttendanceRecord` call the RPC; `ATT_COLUMNS` includes `client_event_id`.
- **Docs:** [`docs/OFFLINE_IDEMPOTENCY.md`](./OFFLINE_IDEMPOTENCY.md) — double-tap, network flake, registration replay.

### To do — you

- Agree **conflict policy** with Maulik/Aahil: last-write-wins vs reject vs supervisor-only correction (beyond idempotent tap).
- Legal / ops: whether duplicate attendance attempts need **audit log** entries.

---

## 3. Revocation sync

### Done (repo)

- `revocation_log` table (`001`) + RLS (`002`).
- Local `Worker.is_revoked` / `revoked_at` hydrated from **site package** inner payload.
- **Edge `sync-revocations`:** `supabase/functions/sync-revocations/index.ts` — device JWT only; body `site_id`?, `since`?, `device_id`?; merges **`revocation_log`** + **`workers.revoked_at`** after `since` (with **365-day** lower clamp when watermark is very old); truncates `reason` for responses; **no PII in logs** (error codes only).
- **`supabase/config.toml`:** `[functions.sync-revocations] verify_jwt = true`.
- **App:** **`syncRevocationsFromServer`** (`src/services/sync/revocationRemoteSync.ts`) — `supabase.functions.invoke` with device session; updates WMDB workers (`is_revoked`, `revoked_at`, clears **`embedding_encrypted_base64`**); called from **`createSyncScheduler`** after attendance/registration push when `siteId` is set.
- **Optional watermark:** Edge bumps **`devices.last_sync_at`** when `device_id` is supplied and matches `site_id` (service role), including successful pulls with zero new revocations.

### To do — you

- Set **`app_metadata.device_id`** on device users to the row’s `public.devices.id` when you want `last_sync_at` cursor + bump (see [`supabase/README.md`](../supabase/README.md)).
- **QA:** revoke worker in Dashboard / SQL → device syncs → **cannot authenticate** (embedding cleared + `is_revoked`).
- Deploy Edge after merge: `npx supabase functions deploy sync-revocations`.
- Apply DB migration **`007`** on the linked project: `npx supabase db push` (or SQL Editor).

---

## 4. Device trust scoring

### Done (repo)

- Postgres `devices.trust_score` (numeric, default in schema).
- RLS allows supervisor/admin to read/update devices for site.

### To do — Cursor / codebase (Day 4+ unless product pulls forward)

- **Signals (incremental):** define scoring function inputs — e.g. failed sync ratio, root/jailbreak flag (if native module exists), app attestation stub, clock skew — map to `trust_score` in `[0, 1]`.
- **Persistence:** `PATCH` devices row or Edge `device-trust-report` with service role validation + rate limit.
- **Consumer:** expose `trustScore` to supervisor UI data layer (Maulik) or block auth below threshold (product decision).
- **Docs:** short `docs/POLICY_DEVICE_TRUST.md` or section in README — what lowers score, who can reset.

### To do — you

- Decide **minimum trust** for field use (hackathon: optional).
- Coordinate with **Sanyam** if native attestation / root checks are in scope for Day 3 or Day 4.

---

## Team Day 3 items (reference — owners not Cursor-only)

Per implementation plan § DAY 3 — for coordination; track in their branches / issues.

| Owner | Task | Notes |
|-------|------|-------|
| **Sanyam** | Indian demographic FAR/FRR tuning; outdoor quality thresholds | Benchmarks feed Day 4 table |
| **Aahil** | Hindi parity `hi.json`; worker guidance polish | Depends on screens |
| **Maulik** | Sync health dashboard + attendance list (Hindi); OpenAPI draft | Uses sync counters + trust indicator from backend |

---

## Related paths (Day 3 touchpoints)

| Path | Notes |
|------|-------|
| [`docs/SYNC_STATE_MACHINE.md`](./SYNC_STATE_MACHINE.md) | State diagram + team purge decision log |
| [`docs/OFFLINE_IDEMPOTENCY.md`](./OFFLINE_IDEMPOTENCY.md) | Tap idempotency + registration replay |
| [`docs/QA_MULTI_DEVICE_SYNC.md`](./QA_MULTI_DEVICE_SYNC.md) | Multi-device QA template |
| `src/services/sync/syncStatusMap.ts` | `computeLocalAttendanceMirrorFromRemote`, purge policy |
| `src/services/sync/attendanceOutboxSync.ts` | Upload + `client_event_id` |
| `src/services/sync/attendanceRemoteReconcile.ts` | Reconcile by `server_record_id` |
| `src/services/sync/revocationRemoteSync.ts` | `syncRevocationsFromServer` |
| `src/services/sync/syncScheduler.ts` | `siteId`, `deviceId`, NetInfo, revoke + reconcile after push |
| `src/repositories/attendanceRepository.ts` | RPC batch + `fetchAttendanceRecordsByIds` |
| `src/components/DeviceSessionRoot.tsx` | Passes `siteId` + `device_id` from JWT |
| `supabase/migrations/007_attendance_client_event_id_and_idempotent_rpc.sql` | Idempotent attendance |
| `supabase/functions/sync-revocations/` | Revocation pull Edge |
| `Pehchaan_Implementation_Plan_v2.md` §8 | API contract |

---

## Day 3 verification (repo / agent)

| Check | How |
|-------|-----|
| TypeScript | `cd Pehchaan && npm run typecheck` |
| Lint | `npm run lint` |
| Migrations listed | `007` in [`supabase/README.md`](../supabase/README.md) |
| WMDB schema | `SCHEMA_VERSION = 4`; migration `toVersion: 4` adds `client_event_id` |
| Idempotent RPC | `insert_attendance_batch_idempotent` granted to `authenticated`; app uses `supabase.rpc` |
| Revocation Edge | `config.toml` `[functions.sync-revocations] verify_jwt = true`; function validates device role + site |
| Scheduler wiring | `syncScheduler.ts` invokes `syncRevocationsFromServer` when `siteId` set; `DeviceSessionRoot` passes optional `deviceId` |

---

## EOD Day 3 checkpoint (plan)

- Sync cycle **confirmed** on device (including failure + retry behaviour you care about).
- **Revocation tested:** revoked worker cannot authenticate after sync.
- **Two-device** simultaneous offline behaviour reviewed (even if “manual QA only” for hackathon).
- Hindi / dashboard / OpenAPI — per team rows above.

---

*Update this file as Day 3 closes. Anoushka-owned Cursor tasks are §1–3; §4 trust scoring remains follow-up; team rows are for visibility only.*
