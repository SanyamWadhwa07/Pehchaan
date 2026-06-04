# Local database (WatermelonDB)

- **`schema.ts`** — SQLite table definitions (`workers`, `attendance_records`, `registration_requests`).
- **`models/`** — `@nozbe/watermelondb` models (decorators enabled in `babel.config.js`).
- **`index.ts`** — `database` singleton + `SQLiteAdapter` (**react-native-quick-sqlite** 8.0.0, compatible with RN 0.73).

## Sync mapping

- **`pushPendingAttendanceOutbox`** — `src/services/sync/attendanceOutboxSync.ts` (WMDB `outbox_sync_status` ↔ Postgres `sync_status`, batch insert, exponential backoff, **`purged`** tombstone via `computeLocalAttendanceMirrorFromRemote` + `ATTENDANCE_PURGE_AFTER_INTEGRATION`).
- **`reconcileAttendanceFromServer`** — `src/services/sync/attendanceRemoteReconcile.ts` (pull server rows by `server_record_id` after push; keeps integration / rare edits in sync).
- **`createSyncScheduler` / `useSyncScheduler`** — `src/services/sync/syncScheduler.ts` (AppState + interval + **NetInfo**; passes `siteId` + optional `device_id` from device JWT in `DeviceSessionRoot`; **revocation pull** + attendance reconcile after push).
- **State machine doc:** [`../docs/SYNC_STATE_MACHINE.md`](../docs/SYNC_STATE_MACHINE.md) · [`../docs/OFFLINE_IDEMPOTENCY.md`](../docs/OFFLINE_IDEMPOTENCY.md) · Day 3 tracker [`../docs/DAY3_TASKS.md`](../docs/DAY3_TASKS.md).
- **`hydrateLocalWorkersFromSitePackage`** — `src/services/sitePackage/hydrateLocalWorkers.ts` (v1 plaintext **or** v2 AES-GCM `payload.bin` + `SITE_PACKAGE_MASTER_KEY`; persists `embedding_encrypted_base64` on `Worker` after schema v2 migration). **Schema v4** adds `attendance_records.client_event_id` for server idempotency.

**Site package crypto & policies:** [`../docs/DAY2_TASKS.md`](../docs/DAY2_TASKS.md) · [`../docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](../docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md) · [`../docs/POLICY_KEY_ROTATION.md`](../docs/POLICY_KEY_ROTATION.md) · [`../docs/POLICY_BIOMETRIC_RETENTION.md`](../docs/POLICY_BIOMETRIC_RETENTION.md).

## Imports

```ts
import { database } from '@/db';
import { Worker } from '@/db/models/Worker';
```

Use **`@nozbe/watermelondb/react`** hooks (`useDatabase`, etc.) inside components wrapped by `DatabaseProvider` (`App.tsx`).
