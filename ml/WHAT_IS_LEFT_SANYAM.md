# What Is Left — Sanyam Wadhwa
**Pehchaan · NHAI Hackathon 7.0 · Deadline: 05 June 2026**
*Updated: 2026-06-04 (Day 4)*

---

## Model State — FINAL ✅

| File | Size | Status |
|---|---|---|
| `ml/models/finetuned/mobilefacenet_indian_ft.onnx` | 13.6 MB | ✅ Fine-tuned FP32, epoch 10 |
| `ml/models/mobilefacenet_indian_int8.onnx` | 3.53 MB | ✅ INT8 ONNX from fine-tuned |
| `ml/models/mobilefacenet_indian.tflite` | 3.76 MB | ✅ TFLite INT8, real-face calibration |
| `ml/models/blazeface.tflite` | 0.22 MB | ✅ Verified inference ok |

---

## Done ✅

| Step | Task | Result |
|---|---|---|
| 1 | Use epoch 10 checkpoint | 97.52% TAR, 0.00% FAR @ 0.30 ✅ |
| 2 | Quantise fine-tuned → INT8 ONNX | 3.53 MB ✅ |
| 3 | TFLite conversion (real-face calibration) | 3.76 MB, 96.53% TAR ✅ |
| 4 | Verify BlazeFace TFLite | Inference ok ✅ |
| 5 | Update `src/constants/auth.ts` thresholds | HIGH=0.30 / MEDIUM=0.20 / MIN=0.18 ✅ |
| — | Benchmark script (desktop CPU) | Embed=6.1ms, e2e est=437ms on desktop ✅ |
| — | `ml/PROGRESS_SANYAM.md` final benchmark table | Filled ✅ |
| — | `ml/THRESHOLD_RESULTS.md` final report | Updated ✅ |

---

## What Is Left ❌

### Step 6 — Android Native Bridge ← DO THIS FIRST

**File:** `android/app/src/main/java/com/pehchaanrnscaffold/FaceRecognitionModule.kt`

This is the **biggest missing piece**. Without it, the app runs on a mock forever.

What it does:
1. Load `mobilefacenet_indian.tflite` from Android assets on init
2. Accept Base64 image from JS
3. Decode → resize 112×112 → normalise [-1, 1] → TFLite INT8 → 512-d embedding
4. Cosine similarity vs. stored worker embedding passed from JS
5. Return `{embedding, confidence, inferenceMs}` as Promise

Also needs:
- `android/app/src/main/java/com/pehchaanrnscaffold/FaceRecognitionPackage.kt`
- Copy `.tflite` files to `android/app/src/main/assets/`
- Add TFLite dependency to `android/app/build.gradle`

---

### Step 7 — iOS Native Bridge

**File:** `ios/PehchaanRnScaffold/FaceRecognitionModule.swift`

Same interface, Swift TFLite runtime. Do after Android bridge works.
If time is critically short — Android only is fine for the demo.

---

### Step 8 — Wire Bridge into the App

**File:** `src/services/faceRecognition/index.ts`

Replace the existing stub with real `NativeModules.FaceRecognition.runInference()` calls.
Coordinate with Aahil — he owns camera frame capture and passes base64 to this function.

---

### Step 9 — Liveness Detection (EAR + Yaw)

Add to `FaceRecognitionModule.kt`:
```kotlin
@ReactMethod
fun checkLiveness(base64Frames: ReadableArray, challenge: String, promise: Promise)
// challenge: "blink" | "head_turn_left" | "head_turn_right"
// Returns: { passed: boolean }
```

- **Blink**: EAR < 0.25 for ≥2 consecutive frames  
  `EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)` using BlazeFace eye landmarks
- **Head-turn**: horizontal nose offset vs. eye midpoint > 20° for ≥3 frames

---

### Step 10 — Device Benchmark

Once TFLite runs on a real Android device, measure with ADB:

```powershell
adb push ml/models/mobilefacenet_indian.tflite /data/local/tmp/
adb shell /data/local/tmp/benchmark_model `
  --graph=/data/local/tmp/mobilefacenet_indian.tflite `
  --num_threads=4 --num_runs=50
# Look for: Inference timings -> avg_ms
```

Or read from Logcat inside the bridge:
```kotlin
val t0 = System.currentTimeMillis()
interpreter.run(inputBuffer, outputBuffer)
Log.d("Pehchaan", "Inference: ${System.currentTimeMillis()-t0}ms")
```

Fill into `ml/PROGRESS_SANYAM.md` Section 9 benchmark table.

---

## Priority Order

```
Step 6  → FaceRecognitionModule.kt        ← CRITICAL, do now
Step 7  → FaceRecognitionModule.swift     ← CRITICAL
Step 8  → Wire faceRecognition/index.ts   ← coordinate with Aahil
Step 9  → Liveness (EAR + yaw)            ← add to bridge
Step 10 → Device benchmark + fill table   ← final
```

---

## What Is NOT Sanyam's (But Must Exist)

| Item | Owner | Depends on |
|---|---|---|
| Camera frame → base64 for bridge | Aahil | Step 8 |
| Liveness challenge UI (blink/head-turn screen) | Aahil | Step 9 just provides detection logic |
| Site package decrypt → worker embeddings on device | Anoushka | Step 6 needs embeddings to compare against |
| Supervisor confirmation UI | Maulik | Needs `{workerId, confidence}` from Step 8 |
