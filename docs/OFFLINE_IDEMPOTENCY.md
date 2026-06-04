# Offline idempotency (attendance & registration)

This note complements **`docs/SYNC_STATE_MACHINE.md`** and Day 3 conflict work in **`docs/DAY3_TASKS.md`**.

## Attendance (`client_event_id`)

- Each logical tap gets a **stable UUID** stored on the WatermelonDB row as `client_event_id` (assigned the first time the outbox row enters `uploading`).
- The device sends that value as Postgres **`attendance_records.client_event_id`** via RPC **`insert_attendance_batch_idempotent`**.
- **Retries** (stuck `uploading` reset, flaky network, app kill mid-request) re-send the same id → the server **returns the existing row** (no duplicate attendance row, no HTTP 500 from unique violation).
- **Double-tap / duplicate offline queue rows:** if the UI creates **two** local rows, each gets its own `client_event_id` → **two** server rows (two intentional taps). Idempotency is per **logical event id**, not per worker/time.

## Registration

- Registration outbox uses server-assigned ids after first insert; supervisor-driven **`register-worker`** Edge flow is **idempotent** when the `registration_requests` row is already `approved` (returns existing `worker_id`).
- Replaying the **same** approved registration id from the client should not create a second worker; repeating a **pending** submission may create duplicate requests if the product layer does not dedupe — treat as a product/UX concern (disable submit after tap).

## Revocations

- **`sync-revocations`** Edge returns `{ worker_id, revoked_at, reason? }[]`; the app updates WMDB workers and **clears embedding ciphertext** so revoked workers cannot authenticate offline.
