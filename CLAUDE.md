# Pehchaan — CLAUDE.md

Offline workforce authentication platform for NHAI construction sites.
**NHAI Hackathon 7.0 · Submission deadline: 05 June 2026**

---

## What This Is

Pehchaan authenticates construction workers **fully offline** using on-device face recognition. A supervisor device holds an encrypted site package containing worker embeddings. Authentication runs locally (no network required), records attendance to a local queue, then syncs to Supabase when connectivity is restored.

---

## Team & Ownership

| Member | Role | Code Areas |
|---|---|---|
| **Aahil** | UI/UX + Integration Architecture | `src/screens/auth/`, `src/screens/registration/`, `src/locales/`, i18n wiring, camera + quality UI |
| **Maulik** | UI/UX + Integration Architecture | `src/screens/supervisor/`, `src/screens/enrollment/`, `src/services/integration/`, `openapi.yaml` |
| **Anoushka** | React Native + Backend | `src/db/`, `src/sync/`, `supabase/`, `src/services/sitePackage/`, WatermelonDB models |
| **Sanyam Wadhwa** | ML / AI | `ml/`, `src/native/FaceRecognition/`, liveness (EAR + yaw), MobileFaceNet TFLite, thresholds |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Mobile | React Native 0.73 (bare CLI) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Face Recognition | MobileFaceNet → TFLite INT8 (Indian demographic tuned) |
| Face Detector | BlazeFace (TFLite) |
| Liveness | MediaPipe Face Mesh — blink (EAR) + head-turn (yaw) |
| Local Storage | WatermelonDB (SQLite) |
| Encryption | react-native-keychain + AES-256-GCM |
| Multilingual | i18next + react-native-localize (English + Hindi) |
| Integration Layer | Modular service classes + OpenAPI 3.0 YAML |
| State | Zustand |
| Navigation | React Navigation v6 |

---

## Key Architecture Decisions

**Offline-first:** All recognition, liveness, and attendance write happens on-device. Network is only needed for sync.

**Supervisor visual confirmation:** After face recognition succeeds, the supervisor sees the stored reference thumbnail + worker name/ID and must tap Confirm before attendance is recorded. Every record includes `supervisorConfirmed: boolean` and `supervisorID`.

**Indian demographic model:** MobileFaceNet fine-tuned on South/South-East Asian faces with augmentation for outdoor lighting, dust, helmets, scarves. FAR <1% and FRR <5% at 0.92 cosine threshold on Indian demographic test set.

**Adaptive auth:** Confidence >0.92 → one challenge done. 0.80–0.92 → second challenge. <0.80 → third challenge + supervisor flag.

**Pluggable Sync Layer (DataLink 3.0 compatible):** The architecture is designed around a sync layer that speaks to a backend interface — not tied to any specific backend. For the hackathon prototype the backend interface is implemented with Supabase to accelerate development. In production the same sync layer connects directly to NHAI DataLink 3.0 APIs by swapping the backend config — no code change required. The presentation narrative should emphasize this:

```
React Native App
↓
Authentication SDK (on-device)
↓
Sync Layer  ←── pluggable backend interface
↓
DataLink 3.0 APIs  (prod) / Supabase mock (dev)
↓
NHAI AWS Infrastructure
```

`src/services/integration/` exposes clean interfaces (`pushAttendance`, `pushWorker`, `syncRevocations`). Plugging in DataLink 3.0 credentials is a config change, not a code change. OpenAPI 3.0 YAML committed to `openapi.yaml`.

> **Presentation tip:** When demoing or in Q&A — lead with DataLink 3.0 compatibility, not Supabase. Supabase is the dev mock. The sync layer is the real product.

**Site package:** Supervisor devices download an AES-256-GCM encrypted zip (from the backend — Supabase Storage in dev, DataLink storage in prod) containing worker embeddings + reference thumbnails scoped to their site. Embedding never exposed via REST.

**Sync state machine:** 5 states — Pending → Uploading → Verified → Purged + Failed (exponential backoff). Purge only after server ACK.

---

## Folder Structure

```
src/
  locales/          # i18n string files (Aahil + Maulik)
    en.json
    hi.json
  screens/
    auth/           # Worker auth flow (Aahil)
    supervisor/     # Supervisor dashboard + confirmation (Maulik)
    enrollment/     # Admin enrollment portal (Maulik)
    registration/   # Field registration flow (Aahil)
    settings/       # Language toggle (Aahil)
  services/
    integration/    # DataLink-ready service layer (Maulik)
    sitePackage/    # Download, decrypt, cache (Anoushka)
  db/               # WatermelonDB models + schema (Anoushka)
  sync/             # Sync state machine (Anoushka)
  native/
    FaceRecognition/ # TFLite bridge — .kt + .swift (Sanyam)
ml/
  models/           # .tflite files (gitignored — see ml/README.md)
  augmentation/     # Dataset augmentation scripts (Sanyam)
supabase/
  migrations/       # PostgreSQL schema + RLS (Anoushka)
  functions/        # Edge functions (Anoushka)
.github/
  workflows/        # CI pipeline
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-side only, never on client
INTEGRATION_API_KEY=          # leave empty — stub for DataLink 3.0
```

---

## ML Models

See [ml/README.md](ml/README.md) for download instructions.
Models are gitignored. Place at `ml/models/mobilefacenet.tflite` and `ml/models/blazeface.tflite`.

---

## Build Priority

**Tier 0 (must ship):** Face recognition pipeline, offline liveness, registration flow, English + Hindi UI, integration-ready architecture, site package download/decrypt, supervisor confirmation, offline queue + sync, benchmarks with measured values.

**Tier 1 (if Tier 0 done by Day 3 EOD):** Adaptive auth, device trust scoring, full audit trail, conflict resolution, worker guidance animations.

---

## Database Tables

`workers`, `sites`, `site_packages`, `attendance_records`, `devices`, `revocation_log`, `registration_requests`

Schema + RLS in `supabase/migrations/001_initial_schema.sql`. Anoushka owns migrations. RLS is mandatory on every table.

---

## Submission Checklist

See `Pehchaan_Implementation_Plan_v2.md` section 11 for the full checklist.
APK/IPA due before 05 June 2026.
