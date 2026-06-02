# Local database (WatermelonDB)

- **`schema.ts`** — SQLite table definitions (`workers`, `attendance_records`, `registration_requests`).
- **`models/`** — `@nozbe/watermelondb` models (decorators enabled in `babel.config.js`).
- **`index.ts`** — `database` singleton + `SQLiteAdapter` (**react-native-quick-sqlite** 8.0.0, compatible with RN 0.73).

## Sync mapping

- **`pushPendingAttendanceOutbox`** — `src/services/sync/attendanceOutboxSync.ts` (WMDB `outbox_sync_status` ↔ Postgres `sync_status`, batch insert).
- **`hydrateLocalWorkersFromSitePackage`** — `src/services/sitePackage/hydrateLocalWorkers.ts` (v1 plaintext **or** v2 AES-GCM `payload.bin` + `SITE_PACKAGE_MASTER_KEY`; persists `embedding_encrypted_base64` on `Worker` after schema v2 migration).

**Site package crypto & policies:** [`../docs/DAY2_TASKS.md`](../docs/DAY2_TASKS.md) · [`../docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](../docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md) · [`../docs/POLICY_KEY_ROTATION.md`](../docs/POLICY_KEY_ROTATION.md) · [`../docs/POLICY_BIOMETRIC_RETENTION.md`](../docs/POLICY_BIOMETRIC_RETENTION.md).

## Imports

```ts
import { database } from '@/db';
import { Worker } from '@/db/models/Worker';
```

Use **`@nozbe/watermelondb/react`** hooks (`useDatabase`, etc.) inside components wrapped by `DatabaseProvider` (`App.tsx`).
