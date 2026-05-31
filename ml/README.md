# ML Models — Pehchaan

Model files are **gitignored** (large binaries). Download them manually and place at the paths below before building.

## Required Models

| Model | Purpose | Target Size | Path |
|---|---|---|---|
| MobileFaceNet INT8 (Indian demographic tuned) | Face recognition — 128-dim embedding | ≤ 16 MB | `ml/models/mobilefacenet_indian.tflite` |
| BlazeFace | Face detection | ≤ 4 MB | `ml/models/blazeface.tflite` |

Combined footprint must remain ≤ 20 MB.

## Pre-Sprint Setup (Run in Order)

> Uses `uv` for fast dependency resolution. Python 3.12 required (mediapipe has no 3.13 wheels yet).

```bash
# 0. Install uv (once)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 1. Create venv with Python 3.12
cd ml/
uv python install 3.12          # downloads 3.12 if not present
uv venv venv --python 3.12

# 2. Install ML toolchain (fast — uv resolves in ~2s)
uv pip install --python venv/Scripts/python.exe -r requirements.txt

# 3. Verify toolchain works (TFLite smoke test)
venv/Scripts/python.exe scripts/setup_toolchain.py

# 3. Download BlazeFace + MobileFaceNet base weights
python ml/scripts/download_models.py

# 4. Prepare Indian demographic dataset (see Dataset section below)
python ml/scripts/prepare_dataset.py --input_dir data/raw/your_dataset

# 5. Augment training set
python ml/augmentation/augment.py \
    --input_dir data/filtered_indian/train \
    --output_dir data/augmented \
    --augmentations_per_image 5

# Day 1 →
# python ml/scripts/quantise.py   (converts base model to INT8 TFLite)
```

### Dataset Options (MS-Celeb-1M is no longer available)

| Option | Notes |
|---|---|
| **VGGFace2** (recommended) | ~3.3M images, diverse. Request at robots.ox.ac.uk/~vgg/data/vgg_face2/ |
| **CASIA-WebFace** | ~500K images. Academic request required. |
| **IJB-C** | NIST dataset, strong demographic diversity. Requires NIST agreement. |
| **Fallback** | Small consented set + heavy augmentation via augment.py. Sufficient for hackathon demo. |

`prepare_dataset.py` filters any of the above by ITA skin tone score + head pose.

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
