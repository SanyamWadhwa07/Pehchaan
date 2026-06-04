# What Is Left — Sanyam Wadhwa
**Pehchaan · NHAI Hackathon 7.0 · Deadline: 05 June 2026**
*Based on: Implementation Plan v2, current codebase, and benchmark results as of 2026-06-03*

---

## Model State Right Now

| File | Status | Valid for submission? |
|---|---|---|
| `ml/models/finetuned/mobilefacenet_indian_ft.onnx` | Fine-tuned, epoch 10, 97.52% TAR | ✅ YES — use this |
| `ml/models/mobilefacenet_indian_int8.onnx` | Quantised from **BASE** model (not fine-tuned) | ❌ Must replace |
| `ml/models/mobilefacenet_indian.tflite` | Converted from **BASE** model (not fine-tuned) | ❌ Must replace |
| `ml/models/blazeface.tflite` | 0.22 MB — needs verification | ⚠️ Verify before use |

Everything flows from `mobilefacenet_indian_ft.onnx`. All steps below are in strict order.

---

## Step 1 — Decide: Use Current Checkpoint or Wait

**Decision needed now.**

Training is at epoch 12. Loss is still dropping (~2.0). The epoch 10 checkpoint already hits **97.52% TAR, 0.00% FAR** — it exceeds the hackathon's >95% requirement.

| Option | Pros | Cons |
|---|---|---|
| **Use epoch 10 now** | Unblocks all downstream steps immediately | Same-pair mean is 0.66 (not the ideal 0.85) — thresholds will be lower than planned |
| **Wait for epoch 20** | Higher same-pair mean (~0.80+), threshold shifts to ~0.45 | Costs ~3–5 more hours of GPU time; delays bridge + liveness work |

**Recommendation: use epoch 10 now.** 97.52% TAR is the measured number. More training is a nice-to-have. The bridge and liveness are the critical path.

**Command to check if training is still running:**
```powershell
Get-Content D:\Pehchaan\ml\finetune.log -Tail 5
```

---

## Step 2 — Quantise the Fine-tuned Model

Replaces the current `mobilefacenet_indian_int8.onnx` (which was from the base model) with a correctly quantised version of the fine-tuned model.

```powershell
cd D:\Pehchaan
& "D:\Pehchaan\ml\venv\Scripts\python.exe" ml/scripts/quantise.py `
    --model ml/models/finetuned/mobilefacenet_indian_ft.onnx `
    --calib_dir data/augmented_indian/train `
    --output ml/models/mobilefacenet_indian_int8.onnx
```

**Expected output:** `ml/models/mobilefacenet_indian_int8.onnx` — ~3–4 MB.
**Acceptance check:** Script prints `[ok] INT8 ONNX ready` and runs a verify inference.

---

## Step 3 — Produce the Fine-tuned TFLite Model (via CI)

The current `mobilefacenet_indian.tflite` is from the base model. You need one from the fine-tuned INT8 ONNX.

TFLite conversion (onnx2tf) only runs on Linux — use GitHub Actions.

```powershell
# Stage and commit the new INT8 ONNX
git add ml/models/mobilefacenet_indian_int8.onnx
git commit -m "feat(ml): quantise fine-tuned model to INT8 for TFLite CI"
git push
```

Then: **GitHub → Actions → `tflite_convert` workflow → Run → Download artifact → place at `ml/models/mobilefacenet_indian.tflite`.**

**Acceptance check:**
```powershell
(Get-Item ml/models/mobilefacenet_indian.tflite).Length / 1MB
# Should be ~3–5 MB
```

---

## Step 4 — Verify BlazeFace TFLite

The existing `blazeface.tflite` is 0.22 MB. Verify it runs inference correctly before wiring into the bridge.

```powershell
& "D:\Pehchaan\ml\venv\Scripts\python.exe" -c "
import numpy as np
try:
    from ai_edge_litert.interpreter import Interpreter
except ImportError:
    import tensorflow as tf; Interpreter = tf.lite.Interpreter
interp = Interpreter('ml/models/blazeface.tflite')
interp.allocate_tensors()
inp = interp.get_input_details()[0]
out = interp.get_output_details()
print('Input:', inp['shape'], inp['dtype'])
print('Outputs:', len(out))
dummy = np.zeros(inp['shape'], dtype=inp['dtype'])
interp.set_tensor(inp['index'], dummy)
interp.invoke()
print('BlazeFace ok')
"
```

If it fails or outputs look wrong — download a fresh BlazeFace TFLite from MediaPipe model zoo and replace it.

---

## Step 5 — Update Thresholds in `src/constants/auth.ts`

The current file has `0.92 / 0.80 / 0.75` — wrong for the fine-tuned model. This is a 2-minute fix.

**File:** [src/constants/auth.ts](src/constants/auth.ts)

Change:
```typescript
// BEFORE (pre-finetune targets — wrong)
export const CONFIDENCE_THRESHOLD_HIGH    = 0.92;
export const CONFIDENCE_THRESHOLD_MEDIUM  = 0.8;
export const CONFIDENCE_THRESHOLD_MINIMUM = 0.75;
```

To:
```typescript
// AFTER (measured from Indian test set, epoch 10 checkpoint)
export const CONFIDENCE_THRESHOLD_HIGH    = 0.45;  // above real-world max diff-pair (0.431)
export const CONFIDENCE_THRESHOLD_MEDIUM  = 0.30;  // 97.52% TAR, 0.00% FAR — proven
export const CONFIDENCE_THRESHOLD_MINIMUM = 0.20;  // supervisor flag mandatory at this tier
```

---

## Step 6 — Write Android Native Bridge

**File to create:** `src/native/FaceRecognition/FaceRecognitionModule.kt`

This is the most critical missing piece. The React Native app calls `NativeModules.FaceRecognition.runInference(base64Image)` — without this file, the app runs on a stub forever.

What it must do:
1. Load `mobilefacenet_indian.tflite` from Android assets on module init
2. Accept a Base64 JPEG/PNG string from JS
3. Decode → resize to 112×112 → normalise to [-1, 1] → run TFLite → return 512-d embedding
4. Compute cosine similarity against the stored worker embedding (passed in, or loaded from site package)
5. Return `{embedding: number[], confidence: number}` as a Promise to JS

Interface contract (must match what `src/services/faceRecognition/index.ts` expects):
```kotlin
@ReactMethod
fun runInference(base64Image: String, workerEmbeddingJson: String, promise: Promise)
// Returns: { embedding: float[], confidence: float, inferenceMs: int }

@ReactMethod  
fun enrollWorker(base64Image: String, promise: Promise)
// Returns: { embedding: float[] }
```

Assets to bundle in `android/app/src/main/assets/`:
- `mobilefacenet_indian.tflite`
- `blazeface.tflite`

---

## Step 7 — Write iOS Native Bridge

**File to create:** `src/native/FaceRecognition/FaceRecognitionModule.swift`

Same interface as Kotlin, Swift TFLite runtime. Do this after Android bridge is smoke-tested.

If time is short before deadline — Android only is acceptable for the demo (state iOS uses same TFLite model, bridge is platform-symmetric).

---

## Step 8 — Wire Bridge into the App (Replace Stub)

**File to edit:** [src/services/faceRecognition/index.ts](src/services/faceRecognition/index.ts)

Currently:
```typescript
export async function runRecognition(): Promise<RecognitionResult> {
  return runRecognitionStub();   // ← this is the mock
}
```

Replace with:
```typescript
import { NativeModules } from 'react-native';
const { FaceRecognition } = NativeModules;

export async function runRecognition(workerEmbedding: number[]): Promise<RecognitionResult> {
  // call the Kotlin/Swift bridge
  const result = await FaceRecognition.runInference(currentFrame, JSON.stringify(workerEmbedding));
  return {
    workerId: result.confidence > CONFIDENCE_THRESHOLD_MINIMUM ? result.workerId : null,
    confidence: result.confidence,
    authTier: authTierFromConfidence(result.confidence),
    qualityCheck: { passed: true },
    inferenceMs: result.inferenceMs,
  };
}
```

Coordinate with Aahil — he owns the camera frame capture and will pass the frame to this function.

---

## Step 9 — Implement Liveness Detection

**EAR Blink** and **Yaw Head-turn** — both fully offline.

This can live in the native bridge (Kotlin) using landmark coordinates from BlazeFace, or as a separate lightweight TFLite landmark model.

### EAR Blink (Eye Aspect Ratio)

```
EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)

Where p1–p6 are the 6 eye landmark points.
Blink detected when: EAR < 0.25 for >= 2 consecutive frames
```

BlazeFace returns 6 keypoints (2 eyes, nose, mouth corners, ears) — enough for a coarse EAR estimate. For precise EAR, add a 68-point landmark TFLite model (~1 MB).

### Yaw Head-turn

```
Yaw estimated from the horizontal distance ratio between:
  nose tip x vs. midpoint of (left eye x, right eye x)
Head-turn detected when: yaw > +20° or < -20° for >= 3 frames
```

### Implementation path (fastest for hackathon)

Add to `FaceRecognitionModule.kt`:
```kotlin
@ReactMethod
fun checkLiveness(base64Frames: ReadableArray, challenge: String, promise: Promise)
// challenge: "blink" | "head_turn_left" | "head_turn_right"
// Returns: { passed: boolean, framesChecked: int }
```

Aahil's UI calls this with the last N frames and the challenge type, gets back a pass/fail.

---

## Step 10 — Benchmark on Physical Device

Once the bridge runs on a real Android device (Redmi Note or any 3GB+ device):

**Option A — TFLite benchmark tool (no app needed, just the .tflite file):**
```powershell
adb push ml/models/mobilefacenet_indian.tflite /data/local/tmp/
# Download benchmark_model binary from TFLite releases, push it:
adb push benchmark_model /data/local/tmp/
adb shell chmod +x /data/local/tmp/benchmark_model
adb shell /data/local/tmp/benchmark_model --graph=/data/local/tmp/mobilefacenet_indian.tflite --num_threads=4 --num_runs=50
# Read: "Inference timings: init=Xms, first=Xms, warmup=Xms, inference=Xms"
```

**Option B — Inside the bridge (most accurate):**
```kotlin
val t0 = System.currentTimeMillis()
interpreter.run(inputBuffer, outputBuffer)
val inferenceMs = System.currentTimeMillis() - t0
Log.d("Pehchaan", "Inference: ${inferenceMs}ms")
```

**Numbers to fill into `Pehchaan_Implementation_Plan_v2.md` Section 9:**

| Metric | Where to measure |
|---|---|
| Recognition latency P50 | benchmark_model or Logcat |
| Face detection latency P50 | benchmark_model on blazeface.tflite |
| Peak RAM | Android Studio Profiler → Memory during auth loop |
| Model size | `(Get-Item ml/models/mobilefacenet_indian.tflite).Length / 1MB` |

---

## Step 11 — Fill Benchmark Table + Final Eval

After device benchmark numbers are in hand:

1. Re-run evaluation on Indian test set with final model:
```powershell
& "D:\Pehchaan\ml\venv\Scripts\python.exe" ml/scripts/test_model.py `
    --onnx_model ml/models/finetuned/mobilefacenet_indian_ft.onnx --skip_tflite
```

2. Update `ml/PROGRESS_SANYAM.md` Section 9 (Benchmark Table) with all measured values — no blanks.

3. Update `Pehchaan_Implementation_Plan_v2.md` Section 9 with measured device numbers.

---

## Priority Order Summary

```
Step 1  → Decision: use epoch 10 checkpoint now (recommended)
Step 2  → quantise.py → mobilefacenet_indian_int8.onnx   [~30 min]
Step 3  → GitHub CI → mobilefacenet_indian.tflite         [~1 hr, waiting on CI]
Step 4  → Verify blazeface.tflite                         [~10 min]
Step 5  → Update src/constants/auth.ts thresholds         [~5 min]
Step 6  → FaceRecognitionModule.kt (Android bridge)       [~3–4 hrs] ← BIGGEST TASK
Step 7  → FaceRecognitionModule.swift (iOS bridge)        [~2 hrs]
Step 8  → Wire bridge into faceRecognition/index.ts       [~30 min, with Aahil]
Step 9  → Liveness: EAR blink + yaw in bridge             [~2 hrs]
Step 10 → Benchmark on device                             [~1 hr]
Step 11 → Fill benchmark table + final eval               [~30 min]
```

**Total estimated time: ~10–12 hours of focused work.**
**Deadline: 05 June 2026.**

---

## What Is NOT Sanyam's (But Must Exist)

| Item | Owner | Sanyam's dependency |
|---|---|---|
| Camera frame → base64 for bridge | Aahil | Step 8 needs this |
| Liveness challenge UI (blink/head-turn screen) | Aahil | Step 9 just provides the detection logic |
| Sync state machine + purge | Anoushka | Independent |
| Site package decrypt → worker embeddings on device | Anoushka | Step 6 needs embeddings to compare against |
| Supervisor confirmation UI | Maulik | Needs `{workerId, confidence}` from Step 8 |
