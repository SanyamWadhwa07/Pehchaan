# QA — Multi-device sync (same site)

**Goal:** Validate two devices on the **same** `site_id` under offline overlap and different reconnect orders — no data loss and sane `outbox_sync_status` / `purged` behaviour.

**Prereqs:** Two physical devices or emulators; two **device** users with identical `app_metadata.site_id` (and distinct `devices` rows); supervisor session available if the flow requires confirm.

---

## Environment

| Item | Device A | Device B |
|------|----------|----------|
| Model / OS | | |
| App build (commit / branch) | | |
| `site_id` (UUID) | | |
| Device auth user | | |
| `ATTENDANCE_PURGE_AFTER_INTEGRATION` in `.env` | | |

---

## Scenario 1 — Sequential offline attendance (no overlap)

| Step | Action | Expected |
|------|--------|----------|
| 1 | A: airplane mode ON | |
| 2 | A: record 1 attendance (local `pending`) | |
| 3 | A: airplane mode OFF | Row → `purged` (or `verified` then `purged` per policy); `server_record_id` set |
| 4 | B: online; record different worker / time | B’s row syncs independently |

**Result:** Pass / Fail — notes:

---

## Scenario 2 — Overlap offline, A online first

| Step | Action | Expected |
|------|--------|----------|
| 1 | A + B: both offline | |
| 2 | A: attendance row 1 | Local `pending` |
| 3 | B: attendance row 2 | Local `pending` |
| 4 | A: online → wait sync | A purged/verified per policy |
| 5 | B: online → wait sync | B uploads; no duplicate server PK; RLS allows both for same site |

**Result:** Pass / Fail — notes:

---

## Scenario 3 — Overlap offline, B online first (reverse order)

Repeat Scenario 2 with steps 4–5 swapped (B first, then A).

**Result:** Pass / Fail — notes:

---

## Scenario 4 — Kill mid-upload (single device)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start sync / ensure `uploading` then force-kill app | |
| 2 | Relaunch | Row returns to `pending` and eventually succeeds; **no** duplicate `attendance_records` id on server for the same `client_event_id` (see `docs/OFFLINE_IDEMPOTENCY.md`). |

**Result:** Pass / Fail — notes:

---

## Scenario 5 — Reconcile picks integration update

| Step | Action | Expected |
|------|--------|----------|
| 1 | Device uploads attendance → local `purged` or `verified` per policy | |
| 2 | In Supabase SQL or trigger, set `integration_push_status` to `pushed` (if policy is `after_integration`) | |
| 3 | Next sync / NetInfo online | `reconcileAttendance` updates row; local moves to `purged` when policy requires integration |

**Result:** Pass / Fail — notes:

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Ran scenarios | | |
| Reviewed | | |

---

*Paste results into team chat or link this file from the PR. Update `docs/DAY3_TASKS.md` when Tier-0 QA is complete.*
