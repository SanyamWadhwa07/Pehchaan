# PEHCHAAN
## Offline Workforce Authentication Platform
### NHAI Hackathon 7.0 — Implementation Plan & Execution Document — v2.0

**Team of 4 · 4-Day Sprint · Submission: 05 June 2026**

---

| Member | Role | Primary Scope | Day Target |
|---|---|---|---|
| **Aahil** | UI/UX #1 + Integration Architecture | Worker auth flow, liveness screens, multilingual i18n, scalable integration layer | All 4 Days |
| **Maulik** | UI/UX #2 + Integration Architecture | Supervisor dashboard, enrollment UI, registration flow, API surface design | All 4 Days |
| **Anoushka** | React Native + Backend | Sync layer, dev backend schema (Supabase mock), registration backend, RN core, WatermelonDB | All 4 Days |
| **Sanyam Wadhwa** | ML / AI | Face recognition, Indian demographic model, liveness detection, quality thresholds, adaptive auth | All 4 Days |

---

## 1. Project Overview & Updated Architecture

This document covers every task, owner, dependency, and daily target for the 4-day build sprint. All architectural decisions reflect the updated design — including the supervisor visual confirmation step, Indian demographic model tuning, multilingual support, integration-ready architecture, and the employee registration flow.

### 1.1 New Features Added (v2.0)

| Feature | What It Means | Owner | Day Target |
|---|---|---|---|
| **Integration-Ready Architecture** | App built with clean, modular API surfaces so it can plug into NHAI DataLink 3.0 or any NHAI portal when requested — without a rebuild. | Aahil + Maulik | Day 2–3 |
| **Employee Registration Flow** | Full onboarding: personal details → ID verification → 4-angle face capture → optional PPE variants (helmet/glasses — skippable) → embedding generation → site package rebuild trigger. | All | Day 1–2 |
| **Indian Demographic Face Model** | MobileFaceNet fine-tuned/validated on Indian demographic data — darker skin tones, varied outdoor lighting, helmets, turbans, scarves. FAR/FRR tuned accordingly. | Sanyam Wadhwa | Day 1–3 |
| **Multilingual: English + Hindi** | Full i18n with react-native-localize + i18next. All worker-facing screens, error states, liveness guides, and supervisor UI available in both languages. | Aahil + Maulik | Day 1–3 |

### 1.2 Core Change: Supervisor Visual Confirmation

Every authentication event includes a mandatory supervisor confirmation step before attendance is recorded:

- After face recognition succeeds, the stored reference thumbnail + worker name and ID are displayed on the supervisor device.
- The supervisor physically compares the displayed photo against the person standing in front of them.
- Supervisor taps **Confirm** or **Reject**. Only a Confirm tap records the attendance event.
- The audit trail record includes `supervisorConfirmed: boolean` and `supervisorID: string` alongside all existing fields.
- The reference thumbnail (one per worker, captured at enrollment) is retained in the site package specifically for this step.

### 1.3 Pluggable Sync Layer — DataLink 3.0 Compatible Architecture

> **Presentation narrative:** The prototype backend uses a mock implementation (Supabase) to accelerate development. The synchronisation layer is designed to communicate with DataLink 3.0 APIs, allowing seamless integration into NHAI's existing infrastructure with minimal changes.

The architecture is a **pluggable sync layer** — not a Supabase app. DataLink 3.0 is the production target. Supabase is the dev mock behind the same interface.

```
React Native App
↓
Authentication SDK  (on-device — fully offline)
↓
Sync Layer  ←── pluggable backend interface
↓
DataLink 3.0 APIs  (prod) / Supabase mock  (dev)
↓
NHAI AWS Infrastructure
```

Aahil and Maulik own the integration layer. Requirements:

- All sync outputs are structured as documented REST-compatible payloads — no proprietary binary formats.
- A dedicated sync/integration service layer (`src/services/integration/`) exposes clean interfaces: `pushAttendance()`, `pushWorker()`, `syncRevocations()`.
- Backend endpoint + API key are config-driven — switching from the Supabase dev mock to DataLink 3.0 is a `.env` change, not a code change.
- OpenAPI 3.0 YAML generated and committed — Maulik owns this. Endpoints map to DataLink 3.0 expected surface.
- Dev backend edge functions (Supabase) are modular and isolated behind the sync layer interface; a DataLink 3.0 adapter slot is defined and empty.

### 1.4 System Planes (Updated)

| Plane | Components |
|---|---|
| **Central (Online)** | Admin portal → ID verification → Employee Registration (details + 4-angle capture + optional PPE variants) → reference thumbnail saved → embedding generated → AES-256 encrypted → backend storage (Supabase dev mock / DataLink 3.0 in prod) → site package built → distributed to supervisor devices |
| **Field (Fully Offline)** | Pehchaan app (English/Hindi) → face quality check → liveness challenge → face recognition (Indian demographic model) → supervisor visual confirmation → attendance recorded in local encrypted queue → sync layer on reconnect → backend ACK → purge → DataLink 3.0-compatible payload ready |

---

## 2. Technology Stack

| Layer | Choice | Rationale | Owner |
|---|---|---|---|
| Mobile | React Native 0.73 (bare CLI) | Full native module access for TFLite bridge; no Expo managed restrictions | Anoushka |
| Dev Backend (Mock) | Supabase (PostgreSQL + Auth + Storage) | Dev mock behind the pluggable sync layer. In prod the sync layer targets DataLink 3.0 APIs — config change only. RLS + JWT matches DataLink 3.0 auth model. | Anoushka |
| Face Recognition | MobileFaceNet → TFLite INT8 (Indian Demographic Tuned) | Mobile-optimised, 128-dim embedding; validated on Indian demographic dataset for FAR/FRR accuracy | Sanyam |
| Face Detector | BlazeFace (TFLite) | ~3MB, runs on-device, sufficient for frontal detection in outdoor conditions | Sanyam |
| Liveness | MediaPipe Face Mesh landmarks | Blink (EAR ratio) + head-turn (yaw) fully offline; tested on PPE-wearing workers | Sanyam |
| Local Storage | WatermelonDB (SQLite) | Offline-first, sync-friendly schema; PostgreSQL-compatible sync adapter | Anoushka |
| Encryption | react-native-keychain + AES-256-GCM | Keys in Android Keystore / iOS Keychain; embeddings never in plaintext | Anoushka |
| Multilingual | i18next + react-native-localize | Runtime language detection; English + Hindi string files; language toggle in settings | Aahil + Maulik |
| Integration Layer | Modular service classes + OpenAPI 3.0 YAML | Clean API surface for future DataLink 3.0 or NHAI portal integration without rebuild | Aahil + Maulik |
| State Management | Zustand | Lightweight, no boilerplate, easy to slice per feature | Anoushka |
| Navigation | React Navigation v6 | Industry standard for bare RN | Anoushka |

---

## 3. Dev Backend Schema (Sync Layer — DataLink 3.0 Compatible)

All tables below represent the dev backend schema (PostgreSQL via Supabase mock). The schema structure is designed to map cleanly to DataLink 3.0's data model so migration to production is config-only. Anoushka owns migrations. Row-Level Security (RLS) policies are mandatory on every table.

### 3.1 Core Tables

| Table | Key Fields |
|---|---|
| **workers** | id, name, site_id, reference_thumbnail_url, embedding_encrypted (bytea), enrolled_at, revoked_at (nullable), created_by, language_preference (en/hi) |
| **sites** | id, name, project_code, supervisor_id, package_version, package_expires_at |
| **site_packages** | id, site_id, version, created_at, storage_path (signed URL to zip in Supabase Storage) |
| **attendance_records** | id, worker_id, site_id, device_id, auth_timestamp, confidence_score, liveness_score, challenge_type, challenge_result, supervisor_id, supervisor_confirmed (bool), sync_status (enum), server_record_id, purged_at, integration_push_status |
| **devices** | id, supervisor_id, site_id, platform, revoked (bool), last_sync_at, trust_score |
| **revocation_log** | id, worker_id, site_id, revoked_by, revoked_at, reason |
| **registration_requests** | id, worker_name, aadhaar_ref_hash, site_id, submitted_by, status (pending/approved/rejected), created_at, approved_at |

### 3.2 RLS Policy Rules

- Supervisors can only read workers and attendance_records for their assigned `site_id`.
- Devices authenticate via Supabase JWT; device token scoped to `site_id`.
- Attendance inserts allowed from authenticated device tokens only.
- Worker embeddings never exposed via REST API — downloaded only as part of the encrypted site package zip.
- Admin role (service_role key, server-side only) has full access — never expose on client.
- `integration_push_status` field updated only by server-side edge functions, never by device JWT.

---

## 4A. Employee Registration Flow

This flow covers how a worker is onboarded into Pehchaan — both centrally (admin-led) and in the field (supervisor-led with sync).

### 4A.1 Two Registration Paths

| Path | Description |
|---|---|
| **Central Registration (Pre-Site)** | Admin registers worker in the admin portal before site deployment. Full multi-angle capture in controlled conditions. Aadhaar/ID verification step included. Embedding generated immediately. Site package rebuilt and pushed to supervisor devices. |
| **Field Registration (Supervisor-Led)** | Supervisor registers a new worker on-site via Pehchaan when a pre-registered worker is absent. Worker details entered → single frontal capture → queued locally → embedding generated on server after sync → site package incremental update triggered. |

### 4A.2 Central Registration Flow (Admin Portal)

| Step | Screen / Action | Detail | Owner |
|---|---|---|---|
| 1 | Worker Details Entry | Name, role, site assignment, contact number, language preference (en/hi). Admin portal (web). | Maulik |
| 2 | ID Verification | Aadhaar number entered → hash stored (no raw Aadhaar stored). Status: verified / pending manual review. | Anoushka |
| 3 | Multi-Angle Capture | 4 required captures: frontal, left 30°, right 30°, up tilt. UI guides in Hindi or English. | Maulik + Sanyam |
| 4 | PPE Variant Capture (Optional) | Helmet-on and glasses-on variants — captured only if worker wears PPE on site. Skippable per variant. Improves liveness fallback accuracy but not mandatory for enrollment. | Maulik + Sanyam |
| 5 | Reference Thumbnail | Single clean frontal thumbnail saved for supervisor confirmation display. | Maulik + Sanyam |
| 6 | Embedding Generation | MobileFaceNet processes all captures → 128-dim embedding → AES-256-GCM encrypted → stored in PostgreSQL. | Sanyam |
| 7 | Site Package Rebuild | `create-site-package` edge function triggered → new package version built → pushed to supervisor devices on next sync. | Anoushka |

### 4A.3 Field Registration Flow (Supervisor App)

| Step | Screen / Action | Detail | Owner |
|---|---|---|---|
| 1 | New Worker Tab | Supervisor navigates to 'Register New Worker' in Pehchaan. Hindi/English UI. | Aahil |
| 2 | Basic Details | Worker name, role, ID number entered. Language preference selected. | Aahil + Anoushka |
| 3 | Field Capture | Single frontal capture (outdoor quality check enforced). Temporary reference thumbnail saved locally. | Aahil + Sanyam |
| 4 | Local Queue | Registration request written to WatermelonDB local queue with status: `pending_registration`. | Anoushka |
| 5 | Server Processing | On sync: `registration_requests` record inserted → server generates embedding → updates workers table → triggers site package incremental update. | Anoushka + Sanyam |
| 6 | Device Update | Supervisor device receives updated site package on next sync cycle. New worker can authenticate. | Anoushka |

---

## 4B. Multilingual Support

All worker-facing and supervisor-facing UI in Pehchaan supports English and Hindi. Language is auto-detected from device locale and can be manually toggled in Settings.

### 4B.1 Implementation

- Library: `i18next` + `react-native-localize`. Language files: `src/locales/en.json` and `src/locales/hi.json`.
- Language toggle in the Settings screen — persisted via AsyncStorage.
- All static strings, error messages, liveness guide labels, and registration prompts are externalised. No hardcoded UI strings in component files.
- Hindi translations cover all worker-facing screens. Supervisor dashboard has Hindi option but defaults to English.
- Animated guides (blink/head-turn) use icon + animation — the label below the animation is translated.

### 4B.2 String Scope by Owner

| Owner | Scope of Translations |
|---|---|
| **Aahil** | Worker auth flow strings: quality check messages, liveness challenge prompts, error/retry messages, auth result screens, registration form labels. |
| **Maulik** | Supervisor dashboard strings: confirmation screen labels, attendance list headings, sync dashboard, enrollment portal labels, settings screen. |

---

## 4C. Indian Demographic Face Model

The base MobileFaceNet model is validated and tuned specifically for Indian demographic characteristics to ensure equitable accuracy across the Pehchaan workforce.

### 4C.1 Why This Matters

- General-purpose face recognition models are predominantly trained on Western/East Asian datasets, leading to higher false rejection rates (FRR) for darker skin tones.
- NHAI construction workers represent diverse Indian demographics: varying skin tones, facial structures, outdoor lighting conditions, dust, sweat, and PPE.
- Biometric systems used for attendance must perform equally across all demographics to be fair and compliant.

### 4C.2 Approach (Sanyam Wadhwa)

- **Dataset:** MS-Celeb-1M subset filtered for South/South-East Asian faces + synthetic augmentation (skin tone, lighting, dust/haze simulation).
- **Fine-tuning:** Last 2 layers of MobileFaceNet retrained on demographic-filtered dataset. Full model remains INT8 quantised for TFLite.
- **Augmentation pipeline:** random brightness (simulate harsh sunlight/shadow), hue shift (skin tone variation), Gaussian noise (dust/sweat), occlusion patches (helmet straps, scarves).
- **Threshold tuning:** FAR and FRR measured separately on Indian demographic test set. Thresholds (0.92 / 0.80) validated to maintain <1% FAR and <5% FRR on this population.
- **Outdoor lighting test:** model tested under 4 conditions — direct sunlight, overcast, backlit, shadow — on Indian demographic faces.

### 4C.3 Deliverables by Day 3

| Deliverable | Detail |
|---|---|
| Tuned TFLite model | MobileFaceNet INT8, ≤16MB, validated on Indian demographic test set. FAR/FRR table filled with measured values. |
| Augmentation script | Python script for dataset augmentation reproducibility. Committed to repo. |
| Threshold report | FAR/FRR values at 0.92, 0.85, 0.80 cosine thresholds documented. Outdoor lighting performance table. |
| Benchmark comparison | Side-by-side: base MobileFaceNet vs. Indian-demographic-tuned model on test set. Difference in FRR documented. |

---

## 5. Authentication Flow (Updated)

| # | Stage | Detail | Owner |
|---|---|---|---|
| 1 | Face Quality Check | Laplacian blur score, histogram lighting check, landmark occlusion, yaw/pitch ±30°. Fail → animated guide (Hindi/English), retry. | Aahil + Sanyam |
| 2 | Liveness Challenge | Random: blink (EAR) or head-turn (yaw). PPE fallback: occluded eyes → force head-turn. Timeout 5s. Max 3 attempts. Prompts in Hindi/English. | Sanyam + Aahil |
| 3 | Face Recognition | MobileFaceNet TFLite (Indian demographic tuned) → 128-dim embedding → cosine similarity. Returns confidence score. | Sanyam |
| 4 | Adaptive Auth | >0.92: single challenge done. 0.80–0.92: second challenge. <0.80: third challenge + supervisor notification flag. | Sanyam + Aahil |
| 5 | Supervisor Confirmation | Thumbnail + worker name + ID on supervisor device (Hindi/English). Supervisor taps Confirm/Reject. Confirmation timestamp + supervisorID logged. | Maulik + Anoushka |
| 6 | Attendance Write | Full record written to WatermelonDB queue. Status: Pending. `integration_push_status`: queued. | Anoushka + Sanyam |
| 7 | Sync | On network: batch upload → PostgreSQL via Supabase → server ACK → status: Verified → purge. Integration-ready payload flagged. | Anoushka |

---

## 6. Project Timeline

| Phase / Day | Aahil (UI/UX + Integ.) | Maulik (UI/UX + Integ.) | Anoushka (RN + Backend) | Sanyam (ML/AI) | Milestones & Dependencies |
|---|---|---|---|---|---|
| **Pre-Sprint** | Set up i18n skeleton; English + Hindi string files; review NHAI brand guidelines | Wireframe enrollment & supervisor screens; define integration-ready API contract surface | Supabase project created; migrations scripted; env vars configured | Download MobileFaceNet + BlazeFace weights; source Indian demographic dataset; set up TFLite toolchain | Repo initialised; CI/CD pipeline drafted; team channel set up |
| **Day 1 — Foundation** | Camera screen skeleton; face bounding box overlay; quality feedback UI; Hindi string stubs wired | Design system (tokens, typography, spacing); enrollment admin portal UI (multi-angle, PPE, Hindi labels) | Supabase schema live (7 tables + RLS); Auth + device JWT; Storage bucket; WatermelonDB models | MobileFaceNet PTQ INT8 quantisation; BlazeFace TFLite verified on emulator; RN native bridge scaffold (Android + iOS) | **EOD:** TFLite bridge returns embedding from test image. Schema live. Camera preview on device. |
| **Day 2 — Core Auth Loop** | Liveness challenge UI (blink/head-turn animations, Hindi); auth result screens; registration flow screens | Supervisor confirmation screen (thumbnail + name + Hindi labels); supervisor home screen; registration UI wired to backend | Site package builder (AES-256-GCM, zip, Storage); local decrypt; WatermelonDB sync adapter; registration API endpoints | Liveness: EAR blink + yaw head-turn; full recognition pipeline (BlazeFace→MobileFaceNet→cosine); adaptive auth thresholds | **EOD:** Full auth loop end-to-end. Registration flow saves worker + triggers embedding. Site package downloads + decrypts. |
| **Day 3 — Offline & Sync** | Multi-device test; worker guidance polish (icon + animation, Hindi); i18n language toggle in settings | Sync health dashboard (live counters); attendance list view; integration-ready API doc draft | Sync state machine (5 states, exponential backoff); conflict resolution; revocation sync; device trust scoring | Indian demographic FAR/FRR threshold tuning; face quality threshold finalisation (outdoor lighting); adaptive auth validated | **EOD:** Sync cycle confirmed. Revocation tested. Two-device simultaneous op verified. Hindi UI reviewed. |
| **Day 4 — Polish & Demo** | Auth flow final animation polish; Samsung A-series layout fixes; Hindi copy review | Dashboard polish + expiry warning; presentation slides (architecture, benchmark, demo narrative, roadmap) | Benchmark harness (50 auth cycles, P50/P95); audit trail verification; README; APK/IPA build | Model size verification (≤20MB); peak RAM + battery benchmarks; benchmark table filled with measured values | **EOD:** All benchmarks measured. Demo rehearsed 2×. Deck complete. APK submitted before 05 Jun 2026. |

### 6.1 Critical Path

| Task | Depends On | Risk if Late |
|---|---|---|
| Native TFLite bridge (Day 1 EOD) | MobileFaceNet INT8 model ready | Blocks entire recognition + liveness pipeline |
| Indian demographic model validation (Day 3) | Training data + augmentation pipeline (Day 1–2) | Benchmark table cannot be filled with valid values |
| Site package download (Day 2) | Supabase Storage + edge function (Day 1) | No embeddings on device — recognition impossible |
| Registration backend (Day 2) | Supabase schema + registration_requests table (Day 1) | Field registration queue has no server handler |
| Supervisor confirmation UI (Day 2) | Recognition pipeline returning {workerId, thumbnail} | Can be built with mock data; wire Day 2 afternoon |
| i18n strings complete (Day 3 EOD) | All UI components implemented | Hindi UI fails review; demo cannot switch languages |
| Benchmarks (Day 4) | Full auth loop on physical device (Day 3 EOD) | Estimated values are disqualifying — must be measured |

---

## 7. 4-Day Execution Plan

All four members work in parallel from Day 1. Integration checkpoints at EOD Day 2 and EOD Day 3.

---

### DAY 1 — Foundation Sprint
> Schema live · ML model on device · Skeleton screens · i18n scaffold · Registration tables

| Owner | Task | Acceptance Criteria |
|---|---|---|
| Anoushka | Supabase project init + registration tables | All 7 tables (incl. registration_requests) live with RLS. Test supervisor can log in. Seed 1 test site + 1 test worker. |
| Anoushka | Auth & device JWT + Storage bucket | Supervisor login via Supabase Auth. Device JWT. Keychain storage. Site-packages bucket created. |
| Sanyam | MobileFaceNet INT8 quantisation | PTQ INT8 via TFLite converter. Size ≤16MB. Accuracy verified on Indian demographic test set baseline. |
| Sanyam | BlazeFace + RN native bridge scaffold | BlazeFace TFLite verified on emulator. `NativeModules/FaceRecognition.kt` + `.swift` expose `runInference()` → `Promise<{embedding, confidence}>`. |
| Sanyam | Indian demographic dataset setup | Dataset filtered/prepared. Augmentation pipeline script committed. Baseline FAR/FRR measured on base model. |
| Aahil | RN project bootstrap + camera skeleton | Dependencies installed. Camera screen with bounding box overlay. Quality feedback overlay. i18n skeleton (`en.json` + `hi.json`) wired. |
| Aahil | i18n scaffold | i18next + react-native-localize installed. Language detection working. English strings complete. Hindi stubs in place. |
| Maulik | Design system + enrollment UI | Color tokens, typography, spacing committed. Multi-angle capture UI with Hindi/English labels. Reference thumbnail capture flow. |
| Maulik | Registration form UI (Central) | Admin portal: worker details form, ID verification field, language preference toggle. Wired to registration_requests endpoint stub. |

**✔ EOD Checkpoint:** TFLite bridge returns valid embedding. Schema + RLS live. Camera preview on Android. i18n skeleton compiles. Design system committed.

---

### DAY 2 — Core Auth Loop
> Recognition working · Registration live · Liveness complete · Hindi UI

| Owner | Task | Acceptance Criteria |
|---|---|---|
| Anoushka | Site package builder (AES-256-GCM) | `create-site-package` edge function: fetch workers, encrypt embeddings, pack zip + thumbnails, upload to Storage, return signed URL + wrapped key. |
| Anoushka | Registration backend (Central + Field) | POST `/registration` endpoint: saves `registration_requests` → triggers embedding generation → updates workers table → queues site package rebuild. |
| Anoushka | WatermelonDB schema + field registration queue | Worker, AttendanceRecord, RegistrationRequest models. Field registration writes to local queue with status: `pending_registration`. |
| Sanyam | Liveness: EAR blink + yaw head-turn | Blink: EAR <0.2 for ≥2 frames @15fps. Head-turn: yaw >+20° or <−20° for ≥3 frames. PPE fallback logic implemented. |
| Sanyam | Full recognition pipeline | BlazeFace detect → crop → MobileFaceNet (Indian tuned) → cosine similarity → `{workerId, confidence}` or `{noMatch}`. |
| Aahil | Liveness challenge UI (Hindi/English) | Animated blink + head-turn cards. Progress indicator. Timeout countdown. 3-failure supervisor override. All strings translated. |
| Aahil | Field registration UI | Supervisor 'Register New Worker' flow: details form (Hindi/English) → camera capture → submit to local queue. Confirmation screen. |
| Maulik | Supervisor confirmation screen (Hindi/English) | Full-screen card: thumbnail (large), worker name, ID, site, shift. Confirm (green) + Reject (red) with haptic. Hindi labels. |
| Maulik | Integration service layer scaffold | `src/services/integration/` with `pushAttendance()`, `pushWorker()` interfaces. Config-driven — API key slot defined but empty. OpenAPI YAML skeleton. |

**✔ EOD Checkpoint:** Full auth loop end-to-end. Registration flow saves worker + triggers embedding. Liveness detecting correctly. Hindi UI renders on all auth screens. Integration service layer committed.

---

### DAY 3 — Offline Reliability & Sync
> State machine · Revocation · Hindi complete · Demographic tuning done

| Owner | Task | Acceptance Criteria |
|---|---|---|
| Anoushka | Sync state machine (5 states) | Pending→Uploading→Verified→Purged + Failed with exp. backoff. Batch upload. Purge only after ACK. |
| Anoushka | Revocation sync + device trust | `sync-revocations` edge function. Revoked worker embeddings deleted on device post-sync. Device trust score stored in PostgreSQL. |
| Anoushka | Field registration sync | `pending_registration` records synced → server processes embedding → site package incremental update → device receives updated package. |
| Sanyam | Indian demographic threshold tuning | FAR/FRR measured on Indian demographic test set at 0.92, 0.85, 0.80 thresholds. Final thresholds selected. Values documented. |
| Sanyam | Outdoor lighting + quality threshold finalisation | Laplacian / histogram / occlusion thresholds tested under 4 outdoor lighting conditions. Final values committed. |
| Aahil | Hindi string completion + language toggle | All `en.json` strings mirrored in `hi.json`. Language toggle in Settings persists across app restarts. |
| Aahil | Worker guidance polish | All animated guide states finalised. Helmet + safety glasses paths tested. No hardcoded strings anywhere. |
| Maulik | Sync health dashboard + attendance list (Hindi) | Live counters (authenticated, pending, uploading, synced). Last sync timestamp. Device trust indicator. Hindi labels complete. |
| Maulik | OpenAPI 3.0 YAML complete | All endpoints documented: auth, sync, registration, revocation. Integration hooks documented. Committed to repo. |

**✔ EOD Checkpoint:** Sync cycle confirmed. Revocation tested. Field registration syncs end-to-end. Hindi UI reviewed by all members. Indian demographic thresholds finalised. Integration service layer complete.

---

### DAY 4 — Polish, Benchmarks & Demo
> Measured values · APK/IPA · Demo rehearsed

| Owner | Task | Acceptance Criteria |
|---|---|---|
| Anoushka | Benchmark harness | Script runs 50 auth cycles on Redmi Note. P50/P95 latency for each stage measured and recorded. |
| Anoushka | Audit trail + README | Every attendance record contains all required fields incl. `integration_push_status`. README with setup instructions committed. |
| Sanyam | Model benchmarks + size verification | Combined TFLite bundle ≤20MB confirmed. Peak RAM + 30-min battery drain measured. Indian demographic FAR/FRR table complete. |
| Sanyam | Benchmark table fill | All Measured column values filled from physical device runs. No estimated values. |
| Aahil | Auth flow polish + demo data | All transitions <300ms. Samsung A-series layout verified. 5 demo worker profiles seeded with Hindi names. |
| Maulik | Dashboard polish + presentation deck | Expiry warning banner. Benchmark slide (measured values). Architecture diagram. Demo narrative. Roadmap. Hindi UI screenshots. |
| All | Demo rehearsal (×2) | Full narrative run under 4 minutes. Language switch demonstrated. Registration flow demonstrated. No errors on second run. |

**✔ EOD Checkpoint:** All benchmarks measured. Demo rehearsed twice without errors. Deck complete with real numbers. APK/IPA on physical device. Code committed. Submitted before 05 June 2026.

---

## 8. API Contract

| Endpoint / Function | Method | Auth | Description |
|---|---|---|---|
| `/functions/v1/create-site-package` | POST | Admin JWT | Builds encrypted site package zip → uploads to Storage → returns signed URL |
| `/functions/v1/download-site-package` | GET | Supervisor JWT | Validates credential → returns package + per-site AES key |
| `/functions/v1/register-worker` | POST | Admin JWT / Device JWT | Creates worker record, triggers embedding generation, queues site package rebuild |
| `supabase.from('attendance_records').insert()` | SDK Insert | Device JWT | Batch insert attendance records on sync. Returns server IDs. |
| `/functions/v1/sync-revocations` | POST | Device JWT | Device sends `last_sync_at` → server returns revoked worker IDs since that timestamp |
| `/functions/v1/device-revoke` | POST | Admin JWT | Invalidates device JWT. Encrypted package becomes inaccessible. |
| `/functions/v1/push-to-integration [STUB]` | POST | Service key | Stub endpoint for future DataLink 3.0 / NHAI portal push. Defined in integration service layer. Not live. |

---

## 9. Benchmark Table

> All Measured values must come from physical hardware runs on Day 4. Estimated values are disqualifying.

| Metric | Target | Measured | Device |
|---|---|---|---|
| Face detection latency (P50) | < 150ms | ___ms | Redmi Note |
| Face detection latency (P95) | < 200ms | ___ms | Redmi Note |
| Liveness challenge latency | < 200ms | ___ms | Redmi Note |
| Recognition latency (P50) | < 150ms | ___ms | Redmi Note |
| Auth decision latency | < 50ms | ___ms | Redmi Note |
| Total auth time incl. supervisor confirm | < 2,000ms | ___ms | Redmi Note |
| Model size — face recognition (Indian tuned) | < 16MB | ___MB | Redmi Note |
| Model size — face detector | < 4MB | ___MB | Redmi Note |
| Combined model footprint | < 20MB | ___MB | Redmi Note |
| Peak RAM during auth session | < 250MB | ___MB | Redmi Note |
| Battery drain (30-min session) | < 5% additional | ___% | Redmi Note |
| FAR — Indian demographic test set (@ 0.92) | < 1% | ___% | Measured offline |
| FRR — Indian demographic test set (@ 0.92) | < 5% | ___% | Measured offline |
| FRR — Indian demographic test set (@ 0.80) | < 10% | ___% | Measured offline |
| i18n language switch latency | < 100ms | ___ms | Redmi Note |

---

## 10. Build Priority Reference

### Tier 0 — Must Ship

| Item | Owner | Day Target | Status |
|---|---|---|---|
| Face recognition (MobileFaceNet + TFLite INT8, Indian demographic tuned) | Sanyam | Day 1–3 | Pending |
| Offline liveness detection (blink + head-turn) | Sanyam | Day 2 | Pending |
| Employee registration flow (Central + Field) | All | Day 1–2 | Pending |
| Multilingual UI (English + Hindi) | Aahil + Maulik | Day 1–3 | Pending |
| Integration-ready architecture + OpenAPI YAML | Aahil + Maulik | Day 2–3 | Pending |
| React Native native bridge to TFLite | Sanyam + Anoushka | Day 1–2 | Pending |
| Site package architecture (download, decrypt, local storage) | Anoushka | Day 1–2 | Pending |
| Supervisor visual confirmation | Maulik + Anoushka | Day 2 | Pending |
| Multi-device offline operation | Anoushka + Aahil | Day 3 | Pending |
| Offline attendance queue + sync state machine + purge-after-ACK | Anoushka | Day 2–3 | Pending |
| Benchmark dashboard with measured values | Sanyam + Anoushka | Day 4 | Pending |

### Tier 1 — High Impact (if Tier 0 complete by Day 3 EOD)

- Adaptive authentication (confidence-scaled challenge intensity)
- Device trust scoring (root/jailbreak, mock GPS, binary tamper)
- Encrypted embeddings in Keystore/Keychain with per-site AES-256 key scoping
- Full audit trail including `supervisorConfirmed`, `supervisorTimestamp`, `integration_push_status`
- Conflict resolution + access revocation on sync
- Worker guidance animations (icon + animation — Hindi/English labels)

### Tier 2 — Roadmap

- Live DataLink 3.0 integration (sync layer is already built and DataLink-compatible — just needs the production API key + endpoint in `.env`; no code change)
- Lighting classification engine: Normal / Low Light / Backlit / Harsh Sunlight → preprocessing
- Behavioural biometrics: accelerometer signature during blink
- Fraud analytics: impossible movement detection, supervisor abuse pattern flagging
- Federated learning: on-device model improvement without sending raw images

---

## 11. Submission Checklist

| | Item | Owner | Status |
|---|---|---|---|
| ☐ | APK/IPA installable on physical device | All | Pending |
| ☐ | All Tier 0 items functional (tested manually) | All | Pending |
| ☐ | Employee registration flow working (Central + Field) | All | Pending |
| ☐ | Hindi UI complete and reviewed by all members | Aahil + Maulik | Pending |
| ☐ | Language toggle working and persisting | Aahil | Pending |
| ☐ | Indian demographic FAR/FRR table filled (measured) | Sanyam | Pending |
| ☐ | Integration service layer committed + OpenAPI YAML in repo | Maulik | Pending |
| ☐ | Supervisor visual confirmation working end-to-end | Maulik + Anoushka | Pending |
| ☐ | Benchmark table fully populated with measured values | Sanyam + Anoushka | Pending |
| ☐ | Sync tested: Pending → Verified → Purged cycle confirmed | Anoushka | Pending |
| ☐ | Revocation tested: revoked worker cannot authenticate post-sync | Anoushka | Pending |
| ☐ | Two-device simultaneous operation tested | Anoushka + Aahil | Pending |
| ☐ | Demo run successfully at least twice without errors | All | Pending |
| ☐ | Presentation deck complete (architecture + benchmark + demo + roadmap) | Maulik | Pending |
| ☐ | README written with setup and run instructions | Anoushka | Pending |
| ☐ | Code committed, repo clean, link ready | All | Pending |
| ☐ | Submission uploaded before 05 June 2026 deadline | All | Pending |

---

*Internal document — not for distribution.*

**Submission deadline: 05 June 2026**
