# ML Pipeline — Pehchaan

Owner: **Sanyam Wadhwa** · Branch: `ml-v1`

---

## Current Status

### Pre-Sprint — COMPLETE ✅

| Task | Status | Notes |
|---|---|---|
| Python 3.12 venv (`ml/venv/`) | ✅ Done | `uv venv venv --python 3.12` |
| TF 2.21.0 + onnx2tf + onnxruntime | ✅ Done | 94 packages, `requirements.txt` |
| MediaPipe 0.10.35 | ✅ Done | Face Mesh + Face Detector |
| OpenCV 4.13.0, Albumentations 2.0.8 | ✅ Done | Augmentation pipeline ready |
| BlazeFace TFLite | ✅ Done | 0.2 MB at `ml/models/blazeface.tflite` |
| MobileFaceNet ONNX (w600k_mbf) | ✅ Done | 13.6 MB at `ml/models/mobilefacenet_base.onnx` — via InsightFace buffalo_sc |
| `ml/scripts/download_models.py` | ✅ Done | Downloads both models; InsightFace primary, GitHub ZIP fallback |
| `ml/scripts/setup_toolchain.py` | ✅ Done | Verifies TF, OpenCV, MediaPipe, Albumentations, NumPy, GPU |
| `ml/scripts/prepare_dataset.py` | ✅ Done | ITA skin-tone filter + head-pose filter + 80/10/10 split + manifest.csv |
| `ml/augmentation/augment.py` | ✅ Done | Albumentations pipeline: brightness, hue, noise, occlusion, flip, rotate |
| Pushed to `ml-v1` | ✅ Done | Commit `537c28e` |

**Known issue:** `setup_toolchain.py` TFLite smoke test shows `[FAIL] 'keras_tensor'` — this is a TF 2.21 API naming change in the test model only. The actual TFLite converter works; not blocking.

---

### Day 1 — TODO 🔴

| Task | Script / File | Depends On | Priority |
|---|---|---|---|
| **INT8 quantisation** | `ml/scripts/quantise.py` (write this next) | `mobilefacenet_base.onnx` ✅ | **CRITICAL PATH** |
| Indian demographic dataset download | HuggingFace `gaunernst/ms1mv3-recordio` | Kaggle/HF credentials | High |
| Run `prepare_dataset.py` on raw MS1MV3 | — | Dataset downloaded | High |
| Run `augment.py` on filtered train set | — | `prepare_dataset.py` done | High |
| Measure baseline FAR/FRR (untuned model) | `ml/scripts/benchmark.py` (write) | `quantise.py` done | High |
| RN native bridge scaffold | `src/native/FaceRecognition/FaceRecognition.kt` + `.swift` | `mobilefacenet_indian.tflite` | High |

**Quantise script** (`ml/scripts/quantise.py`) is the next thing to write. Pipeline:
```
mobilefacenet_base.onnx
  → onnx2tf → TF SavedModel (tmp)
  → TFLiteConverter with representative_dataset_gen (PTQ INT8)
  → ml/models/mobilefacenet_indian.tflite  (target ≤ 16 MB)
```

---

### Day 2 — TODO 🔴

| Task | Notes |
|---|---|
| Fine-tune last 2 MobileFaceNet layers | On Indian demographic filtered + augmented dataset |
| Re-quantise fine-tuned model to INT8 | Re-run `quantise.py` after fine-tune |
| Liveness: EAR blink detection | MediaPipe Face Mesh → EAR <0.2 for ≥2 frames |
| Liveness: yaw head-turn detection | MediaPipe Face Mesh → yaw >±20° for ≥3 frames |
| Wire liveness into RN native bridge | `runLivenessChallenge()` → `Promise<{passed, score}>` |
| Full recognition pipeline | BlazeFace detect → crop → MobileFaceNet → cosine sim → `{workerId, confidence}` |

---

### Day 3 — TODO 🔴

| Task | Notes |
|---|---|
| Adaptive auth thresholds | >0.92 → 1 challenge; 0.80–0.92 → 2 challenges; <0.80 → 3 + supervisor flag |
| Device trust scoring | Integrate with Anoushka's device table |
| Full auth loop on physical device | Critical — benchmarks must come from real hardware |

---

### Day 4 — TODO 🔴

| Task | Notes |
|---|---|
| **Indian demographic FAR/FRR benchmark** | Must be measured, not estimated. Goes in `Pehchaan_Implementation_Plan_v2.md` section 9 |
| Size verification | Combined TFLite bundle ≤ 20 MB |
| Peak RAM + 30-min battery drain | Measured on physical device |
| Side-by-side comparison | Base model vs. Indian-demographic-tuned model FRR delta |

---

## Models

| Model | Purpose | Target Size | Path | Status |
|---|---|---|---|---|
| `mobilefacenet_base.onnx` | Source weights (pre-quantise) | — | `ml/models/mobilefacenet_base.onnx` | ✅ 13.6 MB |
| `mobilefacenet_indian.tflite` | Production model (INT8 PTQ) | ≤ 16 MB | `ml/models/mobilefacenet_indian.tflite` | ❌ Not yet (Day 1) |
| `blazeface.tflite` | Face detection | ≤ 4 MB | `ml/models/blazeface.tflite` | ✅ 0.2 MB |

Combined footprint target: ≤ 20 MB. Model files are **gitignored**.

---

## Environment Setup

> Python 3.12 required. `uv` used for fast dependency management.

```bash
# From repo root — run once
cd ml/

# Venv already created at ml/venv/. To recreate:
uv python install 3.12
uv venv venv --python 3.12
uv pip install --python venv/Scripts/python.exe -r requirements.txt

# Verify
venv/Scripts/python.exe scripts/setup_toolchain.py

# Re-download models if needed
venv/Scripts/python.exe scripts/download_models.py
```

---

## Scripts

| Script | What It Does | Status |
|---|---|---|
| `scripts/download_models.py` | Downloads BlazeFace + MobileFaceNet ONNX | ✅ Done |
| `scripts/setup_toolchain.py` | Verifies all packages are installed and working | ✅ Done |
| `scripts/prepare_dataset.py` | Filters raw dataset by ITA skin tone + head pose; splits 80/10/10 | ✅ Done |
| `scripts/quantise.py` | ONNX → TF SavedModel → INT8 TFLite (PTQ) | ❌ Write next |
| `scripts/benchmark.py` | FAR/FRR on Indian demographic test set | ❌ Day 1–2 |
| `augmentation/augment.py` | Albumentations augmentation pipeline | ✅ Done |

---

## Dataset

MS-Celeb-1M is unavailable (taken down 2019). Use these sources:

| Dataset | Role | Source |
|---|---|---|
| **MS1MV3** (primary) | Training + fine-tune | HuggingFace `gaunernst/ms1mv3-recordio` |
| **VGGFace2** | Secondary training | `robots.ox.ac.uk/~vgg/data/vgg_face2/` (request required) |
| **CASIA-WebFace** | Fallback | Academic request required |
| **JFAD / InFER** | India-specific validation | Research paper contacts |

`prepare_dataset.py` filters any of the above by:
- **ITA score < 28°** → targets skin Type IV–VI (South Asian)
- **Head pose**: yaw ±30°, pitch ±20° (via MediaPipe Face Mesh)
- Outputs 80/10/10 split + `manifest.csv`

---

## Thresholds

| Threshold | FAR Target | FRR Target |
|---|---|---|
| 0.92 (high confidence → 1 challenge) | < 1% | < 5% |
| 0.85 (medium → 2 challenges) | < 2% | < 8% |
| 0.80 (low → 3 challenges + flag) | < 5% | < 10% |

Final measured values go in `Pehchaan_Implementation_Plan_v2.md` section 9.

> All benchmark values must come from physical hardware runs on Day 4. Estimated values are disqualifying.
