# Auth benchmark harness (N6)

Two layers of “benchmark” exist in Pehchaan:

1. **Node harness (CI / laptop)** — `scripts/benchmark-auth-stages.mjs`  
   Measures **JavaScript-side** work analogous to orchestrating `checkFaceQuality` → `runRecognition` → `checkLiveness` (tier thresholds match `src/constants/auth.ts`).  
   **Does not** load TFLite or call `FaceRecognition` native code.

2. **On-device ML (physical hardware)** — `ml/PROGRESS_SANYAM.md`, native `inferenceMs` from `FaceRecognition.runInference`, and future `ml/scripts/benchmark.py` for FAR/FRR tables.

---

## Run (Node)

From repo root **`Pehchaan/`**:

```bash
npm run benchmark:auth
```

Or:

```bash
node scripts/benchmark-auth-stages.mjs
```

### Environment

| Variable | Default | Meaning |
|----------|---------|--------|
| `BENCHMARK_ITERATIONS` | `50` | Number of full auth cycles |
| `BENCHMARK_JITTER_MS` | `0` | Max random delay **per stage** (ms) to simulate variable scheduling; keep `0` for stable CI |

Example with jitter:

```bash
BENCHMARK_ITERATIONS=100 BENCHMARK_JITTER_MS=2 npm run benchmark:auth
```

Output is a Markdown-friendly table: **min**, **P50**, **P95**, **max** per stage plus **total_cycle** wall time.

---

## Models (native path)

- Download / paths: **`ml/README.md`**
- Bundled weights for RN (Android assets / iOS bundle): see main **`README.md`** → ML Models

---

## Supabase (sync / auth backend)

- Migrations + Edge functions: **`supabase/README.md`**
- App keys + secrets sample: **`docs/SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`**
- Client env: **`.env`** from **`.env.example`** (rebuild native app after changes; `react-native-config`)

---

## Keeping thresholds in sync

The harness inlines:

- `CONFIDENCE_THRESHOLD_HIGH` = `0.3`
- `CONFIDENCE_THRESHOLD_MEDIUM` = `0.2`

If you change **`src/constants/auth.ts`**, update the same literals at the top of **`scripts/benchmark-auth-stages.mjs`** (or extract a shared JSON config later).
