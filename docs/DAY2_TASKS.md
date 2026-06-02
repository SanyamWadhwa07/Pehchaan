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
| **Done (repo)** | Already merged / implemented in this codebase (may still need your deploy or wiring). |
| **To do — Cursor / codebase** | Implementation work typically done in-repo (agent or you in IDE). |
| **To do — you** | Human / product / ops: secrets, QA, policy, coordination, Dashboard steps. |

---

## Summary

| Theme | Done (repo) | Still heavy lifting |
|-------|----------------|---------------------|
| Site package (AES · zip · Storage) | **v2:** inner JSON AES-GCM + **key wrap** with site master; zip `manifest.json` + `payload.bin`; Edge uses **service role** to read `embedding_encrypted`; **payload limits**, **worker cap**, **redacted logs**, **idempotency** table `005`; **incremental** mode (`worker_ids`); **v1** fallback when master secret unset | Per-device / HSM key envelope; automatic thumbnail fetch from arbitrary URLs; production key distribution |
| Local decrypt | **v2 decrypt** (`@noble/ciphers` GCM) + `hydrateLocalWorkersFromSitePackage`; WMDB **`embedding_encrypted_base64`** (schema v2 migration) | Golden-vector tests; `per_device` envelope branch |
| WMDB sync adapter | Attendance batch upload + status mirror | UI/job wiring, retries, registration sync |
| Registration APIs | Table + RLS + repository insert/select | Edge `register-worker` + field queue sync |

---

## 1. Site package builder (AES-256-GCM · zip · Storage)

### Done (repo)

- Private bucket **`site-packages`** and `storage.objects` RLS (`003`).
- **`sitePackageStorage.ts`**, **`sitePackageManifest.ts`** (v1 + v2 outer + inner types).
- **Edge `create-site-package`** (`supabase/functions/create-site-package/index.ts`):
  - **v2** when `SITE_PACKAGE_MASTER_KEY` + `SUPABASE_SERVICE_ROLE_KEY` secrets set: fetch workers **with** `embedding_encrypted`, build inner JSON, **AES-256-GCM** data key + wrap with master, **`payload.bin`**, SHA-256 in manifest, zip, upload, `site_packages` + `sites.package_version`.
  - **v1 plaintext** when master secret **unset** (legacy dev).
  - **Incremental** `package_format: "incremental"` + `worker_ids[]` (subset query).
  - **Hardening:** `MAX_WORKERS`, `MAX_INNER_BYTES`, error responses without embedding dumps, idempotency lookup + insert (`005_site_package_publish_idempotency.sql`).
- **`004`** — supervisor `site_packages` insert (v1 path); v2 uses service role for inserts + idempotency.

### To do — Cursor / codebase

- **Per-device / per-site wrapped key** (`key_envelope.kind: per_device_reserved`) — app branch + Edge key material distribution.
- **Thumbnail pipeline** — optional fetch of `reference_thumbnail_url` into `reference_thumbnail_base64` when URLs are Storage-backed (needs signed GET in Edge).
- **True incremental** without explicit `worker_ids` (needs `workers.updated_at` migration + policy).

### To do — you

- Set Dashboard secrets per [`SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](./SUPABASE_DASHBOARD_SECRETS_SAMPLE.md).
- `npx supabase db push` for **`005`**, then `functions deploy`.
- Legal sign-off per [`POLICY_BIOMETRIC_RETENTION.md`](./POLICY_BIOMETRIC_RETENTION.md).

---

## 2. Local decrypt (after download)

### Done (repo)

- **`decryptSitePackageV2Payload`** — unwrap + decrypt inner JSON; **`bytesToBase64` / `base64ToBytes`**, **`byteaFieldToBase64`**.
- **`parseSitePackageFromZipBuffer`** — routes v1 vs v2.
- **`hydrateLocalWorkersFromSitePackage`** — v2 path persists **`embedding_encrypted_base64`** on `Worker`.
- **`SITE_PACKAGE_MASTER_KEY`** in **`src/config/env.ts`** + **`.env.example`** + typings.
- WatermelonDB **schema v2** migration (`embedding_encrypted_base64` column).

### To do — Cursor / codebase

- **`per_device`** envelope decryption.
- Automated **roundtrip test** (Edge encrypt fixture → RN decrypt) in CI or script.

### To do — you

- Rebuild native app after `.env` changes; keep master key out of public repos.

---

## 3. WatermelonDB sync adapter

### Done (repo)

- (unchanged) **`pushPendingAttendanceOutbox`**, **`syncStatusMap`**, **`insertAttendanceRecordsBatch`**, WMDB **`outbox_sync_status`**.

### To do — Cursor / codebase

- Wire sync triggers; registration outbox; backoff.

### To do — you

- QA matrix (offline/online).

---

## 4. Registration API endpoints

### Done (repo)

- (unchanged) Table + RLS + **`registrationRepository`**.

### To do — Cursor / codebase

- Edge **`register-worker`** (or RPC) + field queue sync.

### To do — you

- API contract with team.

---

## Related paths

| Path | Notes |
|------|--------|
| `supabase/functions/create-site-package/index.ts` | v1 + v2 builder |
| `supabase/migrations/005_site_package_publish_idempotency.sql` | Idempotency store |
| `src/services/sitePackage/decryptSitePackage.ts` | RN AES-GCM open |
| `docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md` | Sample secrets |
| `docs/POLICY_KEY_ROTATION.md` | Rotation policy (no cron code) |
| `docs/POLICY_BIOMETRIC_RETENTION.md` | Retention / revocation intent |

---

*Update this file as Day 2 closes.*
