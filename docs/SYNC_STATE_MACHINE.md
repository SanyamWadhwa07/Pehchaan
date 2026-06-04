# Attendance sync — state machine (WatermelonDB ↔ Postgres)

This document is the **canonical** description of local `outbox_sync_status` and how it maps to server `attendance_records`. Code entry points:

- `src/services/sync/syncStatusMap.ts` — `computeLocalAttendanceMirrorFromRemote`, purge policy helper
- `src/services/sync/attendanceOutboxSync.ts` — upload pipeline + module JSDoc
- `src/services/sync/attendanceRemoteReconcile.ts` — post-upload / periodic **pull** of server truth by `server_record_id`
- `src/services/sync/syncScheduler.ts` — orchestrates push + **revocation pull** + reconcile; **NetInfo** + **AppState** triggers

---

## Postgres enum (`sync_status_enum`)

`pending` · `uploading` · `verified` · `purged` · `failed`

WMDB `outbox_sync_status` uses the **same string values** for rows that mirror the server.

---

## Allowed transitions (device outbox)

### A. Upload path (local-first)

| From | To | When |
|------|-----|------|
| `pending` | `uploading` | Sync run selected row for batch insert; **`client_event_id`** assigned once if absent (idempotent server RPC) |
| `uploading` | `pending` | Next sync start: **stuck reset** (app killed mid-request) — safe retry |
| `uploading` | *mirror* | Batch insert returned a row — apply `computeLocalAttendanceMirrorFromRemote` (Postgres **`insert_attendance_batch_idempotent`** sets `sync_status = verified` + `synced_at` on new insert / replay ACK) |
| `failed` | `uploading` | Backoff expired (`retry_count` + `last_error_at`) and row retried |
| `failed` | *(dead letter)* | `retry_count >= ATTENDANCE_MAX_RETRIES` — stop uploading; `fail_reason` set |

### B. Server mirror → local terminal state (`purged`)

After a successful insert, the client applies **`computeLocalAttendanceMirrorFromRemote`** using env **`ATTENDANCE_PURGE_AFTER_INTEGRATION`** (see `.env.example`):

| Policy | Server `sync_status` | Server `integration_push_status` | Local `outbox_sync_status` |
|--------|----------------------|-----------------------------------|---------------------------|
| **immediate** (default; env unset / false) | `verified` | any | `purged` + `purged_at` set |
| **after_integration** (env `true`) | `verified` | `queued` or `failed` | `verified` (wait) |
| **after_integration** | `verified` | `pushed` or `not_applicable` | `purged` + `purged_at` |
| either | `purged` or `purged_at` set | — | `purged` |
| either | `failed` | — | `failed` |

**Tombstone:** we **retain** the WMDB row when moving to `purged` (audit / UX); we do **not** hard-delete locally unless product later opts in.

### C. `failed` re-entry

- From `failed` (under max retries): eligible again when exponential backoff window has passed → treated like `pending` for upload selection.
- From `failed` (dead letter): **not** eligible; remains `failed`.

---

## Team decision log — *when must we purge locally?*

Fill after stand-up / chat with Maulik + integration owner:

| Decision | Choice | Date | Notes |
|----------|--------|------|-------|
| Default for hackathon demo | `immediate_after_verified` (env unset) | | Simplest UX: row leaves “active” queue quickly |
| Production / DataLink | `after_integration_push` (env `true`) | | Local row stays visible until NHAI integration ACK |
| If `integration_push_status` stays `failed` forever | *TBD* | | Options: keep `verified`, supervisor override, or auto-purge after N days (not implemented) |

---

## Reconcile (remote status pull)

`reconcileAttendanceFromServer` loads all local rows for a `site_id` with non-null `server_record_id`, fetches those IDs from Postgres in chunks, and reapplies the same mirror function. Use cases:

- Integration worker updated `integration_push_status` → device picks it up on next sync.
- Rare server-side correction to `sync_status`.

Runs **after** `pushPendingAttendanceOutbox` + `pushPendingRegistrationOutbox` + **`syncRevocationsFromServer`** in the same scheduler tick when `siteId` is passed (`DeviceSessionRoot` reads `app_metadata.site_id`).

---

## Triggers (same tick order)

1. `pushPendingAttendanceOutbox`
2. `pushPendingRegistrationOutbox` (parallel with 1 in `Promise.allSettled`)
3. `syncRevocationsFromServer` (sequential after 1–2, if `siteId` present) — Edge `sync-revocations`; with `deviceId`, omit `since` so the server uses `devices.last_sync_at` as the watermark; updates WMDB workers; with `deviceId` the app also sends Tier‑0 **`trust_score`** + **`app_version`** so Postgres **`devices`** row stays current (N5). See [`OFFLINE_IDEMPOTENCY.md`](./OFFLINE_IDEMPOTENCY.md).
4. `reconcileAttendanceFromServer` (sequential after 3, if `siteId` present)

Also triggered by: **AppState** `active`, **interval** timer, **NetInfo** connected.
