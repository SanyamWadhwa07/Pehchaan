# ML Models — Pehchaan

Model files are **gitignored** (large binaries). Download them manually and place at the paths below before building.

## Required Models

| Model | Purpose | Target Size | Path |
|---|---|---|---|
| MobileFaceNet INT8 (Indian demographic tuned) | Face recognition — 128-dim embedding | ≤ 16 MB | `ml/models/mobilefacenet_indian.tflite` |
| BlazeFace | Face detection | ≤ 4 MB | `ml/models/blazeface.tflite` |

Combined footprint must remain ≤ 20 MB.

## Download Instructions (Sanyam — Day 1)

```bash
# Create models directory
mkdir -p ml/models

# BlazeFace — from MediaPipe model zoo
# https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
# Rename to blazeface.tflite

# MobileFaceNet base weights (pre fine-tuning)
# Source: https://github.com/sirius-ai/MobileFaceNet_TF
# After demographic fine-tuning + INT8 quantisation, export to:
#   ml/models/mobilefacenet_indian.tflite
```

## Fine-Tuning Pipeline

Owner: **Sanyam Wadhwa**

1. Filter MS-Celeb-1M for South/South-East Asian faces
2. Run augmentation pipeline: `python ml/augmentation/augment.py`
3. Retrain last 2 layers of MobileFaceNet on filtered + augmented dataset
4. Apply post-training INT8 quantisation via TFLite converter
5. Verify size ≤ 16 MB and accuracy on Indian demographic test set

## Thresholds

| Threshold | FAR Target | FRR Target |
|---|---|---|
| 0.92 (high confidence) | < 1% | < 5% |
| 0.85 (medium) | < 2% | < 8% |
| 0.80 (low — triggers 3rd challenge) | < 5% | < 10% |

Final measured values go in `Pehchaan_Implementation_Plan_v2.md` section 9 (Benchmark Table).

## Augmentation Script

See `ml/augmentation/augment.py` for the dataset augmentation pipeline.
