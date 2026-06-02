# Pehchaan

**Offline Workforce Authentication Platform — NHAI Hackathon 7.0**

Pehchaan authenticates construction workers **fully offline** using on-device face recognition. No network required at the gate. A supervisor device holds an encrypted site package with worker embeddings; after recognition succeeds, the supervisor visually confirms the match before attendance is recorded. Records sync to the cloud when connectivity is restored.

---

## Team

| Member | Role |
|---|---|
| Aahil | UI/UX + Integration Architecture |
| Maulik | UI/UX + Integration Architecture |
| Anoushka | React Native + Backend |
| Sanyam Wadhwa | ML / AI |

---

## Tech Stack

React Native 0.73 · MobileFaceNet TFLite INT8 (Indian demographic tuned) · BlazeFace · WatermelonDB · AES-256-GCM · i18next (English + Hindi)

**Backend:** Pluggable sync layer designed for NHAI DataLink 3.0. Prototype uses Supabase as a dev mock backend — swapping to DataLink 3.0 is a config change, not a code change.

---

## Setup

### Prerequisites
- Node.js 18+
- React Native CLI (`npm install -g react-native-cli`)
- Android Studio / Xcode
- Supabase account

### Install
```bash
git clone <repo-url>
cd Pehchaan
npm install
cp .env.example .env
```

Edit **`.env`** in the project root (file is gitignored). In Supabase: **Project Settings → API**, copy **Project URL** into `SUPABASE_URL` and the **anon public** key into `SUPABASE_ANON_KEY`. Rebuild the native app after changing `.env` (`react-native-config` reads it at build time).

Do not add the **service_role** key to `.env` — it would be bundled into the app; use it only in Supabase Dashboard or server-side edge functions.

### ML Models
```bash
# See ml/README.md for download instructions
# Place models at:
#   ml/models/mobilefacenet.tflite
#   ml/models/blazeface.tflite
```

### Database
```bash
# Apply migrations via Supabase CLI (see supabase/README.md)
npx supabase db push
```

### Run (Android)
```bash
npx react-native run-android
```

---

## Project Structure

```
src/                  # See src/README.md — constants, lib, i18n, screens, types
docs/                 # CODE_CONVENTIONS.md — naming, layers, PR checklist
ml/                   # Model weights + augmentation scripts
supabase/             # Migrations + edge functions
```

**Code clarity:** [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) · **Git workflow:** [docs/WORKFLOW.md](docs/WORKFLOW.md)

---

## Submission Deadline

**05 June 2026** — APK/IPA on physical device.

See `Pehchaan_Implementation_Plan_v2.md` for the full implementation plan, daily task breakdown, and submission checklist.
