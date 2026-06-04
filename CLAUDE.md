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

---

## Sanyam's ML Goals — Hackathon Scoring Map

Hackathon title: *"Develop a mobile based secure offline facial recognition and liveness detection system for remote locations"*
Submission closure: **05 June 2026**

### Hard Constraints (must pass or disqualified)

| Constraint | Target | Sanyam's Approach |
|---|---|---|
| Model footprint | ≤ 20 MB (smaller = better) | MobileFaceNet TFLite INT8 (~5 MB) + BlazeFace TFLite (~1 MB) = ~6 MB total |
| Inference speed | < 1 second end-to-end on mid-range device | BlazeFace detect + MTCNN align + MobileFaceNet embed pipeline |
| Accuracy | > 95% facial recognition on Indian demographics | ArcFace fine-tune on 231 Indian identities + outdoor augmentation |
| Offline liveness | Blink / head-turn anti-spoofing | EAR (blink) + yaw angle (head-turn) via MediaPipe Face Mesh |
| Open-source only | No paid/proprietary licences | PyTorch, ONNX, TFLite, MediaPipe — all Apache/MIT |
| React Native | Android + iOS | Kotlin TFLite bridge + Swift TFLite bridge in `src/native/FaceRecognition/` |
| Min device | Android 8.0+ / iOS 12+ / 3 GB RAM | TFLite INT8 runs on CPU — no GPU required |

### Scoring Breakdown (Sanyam's contribution to each criterion)

**Innovation — 30 marks**
- INT8 quantisation (onnxruntime static PTQ) — demonstrates edge AI compression
- ArcFace fine-tune on Indian demographic dataset — not a generic off-the-shelf model
- EAR + yaw offline liveness — no cloud anti-spoofing API
- Augmentation pipeline: helmet/scarf occlusion, harsh sunlight, shadow, blur

**Feasibility — 30 marks**
- < 1 sec inference on CPU-only mid-range device (must benchmark and record)
- React Native TFLite bridge exposing `runInference(base64Image) → {embedding, confidence}` — directly pluggable into DataLink 3.0
- BlazeFace detector avoids any native camera dependency

**Scalability & Sustainability — 20 marks**
- Adaptive threshold (0.92 / 0.80 / <0.80) handles varying confidence gracefully
- Augmentation covers outdoor lighting, dust, helmets, scarves
- Embedding-based architecture scales to any number of enrolled workers without retraining

**Presentation & Documentation — 20 marks**
- `ml/PROGRESS_SANYAM.md` — benchmark table with measured FAR/FRR, model size, RAM, inference time
- Architecture diagram (pipeline in CLAUDE.md System Overview)
- Integration guide for RN bridge

### Day 4 Must-Ship Checklist (Sanyam)

- [ ] `mobilefacenet_indian_ft.onnx` — fine-tuned model exported
- [ ] `mobilefacenet_indian_int8.onnx` — INT8 quantised
- [ ] `mobilefacenet_indian.tflite` — TFLite from CI
- [ ] `src/native/FaceRecognition/FaceRecognitionModule.kt` — Android bridge
- [ ] `src/native/FaceRecognition/FaceRecognitionModule.swift` — iOS bridge
- [ ] Liveness: EAR blink + yaw head-turn implemented
- [ ] Benchmark table filled: FAR, FRR, model size MB, inference ms, peak RAM MB
- [ ] Verify model size ≤ 20 MB (target ≤ 10 MB)
- [ ] Verify end-to-end inference < 1000 ms on CPU
