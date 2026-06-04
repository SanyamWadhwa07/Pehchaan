# Fine-Tuning Plan — MobileFaceNet → Indian Demographic
**Owner: Sanyam Wadhwa | Deadline: 05 June 2026**

---

## Goal

Shift the base MobileFaceNet model so it meets Pehchaan's thresholds on Indian construction worker faces:

| Metric | Base (now) | Target post-finetune |
|---|---|---|
| Same-pair mean cosine | 0.53 | ≥ 0.85 |
| Diff-pair mean cosine | 0.002 | ≤ 0.05 |
| TAR at threshold 0.92 | 0% | ≥ 95% |
| FAR at threshold 0.92 | 0% | ≤ 1% |
| Quantisation drift (TFLite/ONNX) | 0.94 | ≥ 0.92 (preserve) |

The test benchmark is our own Indian-demographic val split, not LFW (LFW is Western and is only used to track base model state).

---

## Why the Base Model Is Insufficient

1. **Training distribution mismatch** — MobileFaceNet was trained on MS-Celeb/VGGFace2 which skew toward lighter Fitzpatrick types.
2. **Loss function** — base model used softmax classification. ArcFace adds an angular margin (m=0.5) that forces tighter intra-class clustering, which is what pushes the same-pair mean from ~0.53 to ~0.85+.
3. **Outdoor conditions** — helmets, scarves, dust, harsh sunlight, partial occlusion are not represented in standard web-scraped face datasets.

---

## Data Sources

### Acquired datasets (Kaggle, already downloaded)

| # | Source | Images | Identities | Path | Status |
|---|---|---|---|---|---|
| 1 | **kaggle_indian_actors** (nagasai524) | 5,972 | 135 | `data/raw/kaggle_indian_actors/` | Done |
| 2 | **kaggle_indian2** (aryankashyapnaveen) | 40,541 | 247 | `data/raw/kaggle_indian2/` | Done |
| **Merged** | **data/merged_indian/** | **46,681** | **231** | After dedup + min_images=5 | **Done** |

**Why sufficient:** 231 identities × avg 202 images = well above the 300×5 minimum. With 10× augmentation → ~466k training images.

IMFDB and LFW parquet are no longer needed.

---

## Full Pipeline

```
Step 1  [DONE] Merge Kaggle datasets
        └── python ml/scripts/merge_datasets.py
                --ds1 data/raw/kaggle_indian_actors/actors_dataset/Indian_actors_faces
                --ds2 data/raw/kaggle_indian2
                --output data/merged_indian
        Output: 231 identities, 46,681 images

Step 2  MTCNN align ALL images to 112x112
        └── python ml/scripts/align_dataset.py
                --input_dir data/merged_indian
                --output_dir data/aligned_indian
                --workers 4
        (Script written — running Day 2)

Step 3  train/val/test split + pose filter (skip ITA — already Indian dataset)
        └── python ml/scripts/prepare_dataset.py
                --input_dir data/aligned_indian
                --output_dir data/split_indian
                --skip_ita_filter
        Output: data/split_indian/{train,val,test}/
        Target: 80% train / 10% val / 10% test, stratified by identity

Step 4  Augment train split only (NOT val/test)
        └── python ml/augmentation/augment.py
                --input_dir data/split_indian/train
                --output_dir data/augmented_indian/train
                --augmentations_per_image 10
        Val and test: copy as-is (no augmentation — we measure real performance)

Step 5  Fine-tune
        └── python ml/scripts/finetune.py
                --data_dir data/augmented_indian
                --base_model ml/models/mobilefacenet_base.onnx
                --output_dir ml/models/finetuned
        (Script written — run Day 3)

Step 6  Evaluate on Indian val split
        └── python ml/scripts/test_model.py (with --data_dir pointing at Indian val)
        Check: same-pair mean >= 0.85, FAR <= 1% at 0.92

Step 7  Re-quantise to INT8 TFLite
        └── python ml/scripts/quantise.py
                --model ml/models/finetuned/mobilefacenet_indian_ft.onnx
                --calib_dir data/augmented_indian/train
                --output ml/models/mobilefacenet_indian.tflite
        (Overwrites the current tflite — check quantisation drift stays >= 0.92)

Step 8  Final benchmark
        └── python ml/scripts/test_model.py
        Must hit all 4 target metrics before submission
```

---

## Model Architecture — What to Freeze

MobileFaceNet has ~1M parameters. We fine-tune only the top layers to avoid forgetting general face structure learned on large datasets.

```
MobileFaceNet architecture (simplified):
  Conv1                → FREEZE
  Bottleneck blocks 1-4  → FREEZE   (low-level edge/texture features)
  Bottleneck blocks 5-6  → TRAIN    (mid-level face structure)
  Last conv + BN        → TRAIN
  Linear (512-d)         → TRAIN    (embedding projection — most important)
  ArcFace head           → TRAIN    (new, initialized fresh)
```

Rationale: freezing early layers prevents catastrophic forgetting on 1,500 images. The embedding projection + ArcFace head are what determine cosine clustering.

If same-pair mean is still < 0.75 after 30 epochs → unfreeze blocks 3-4 and run 10 more epochs with lr=1e-5.

---

## ArcFace Loss

Standard ArcFace: `L = -log( e^(s·cos(θ_yi + m)) / (e^(s·cos(θ_yi + m)) + Σ_j≠yi e^(s·cos(θ_j))) )`

| Hyperparameter | Value | Reason |
|---|---|---|
| Margin `m` | 0.5 | Standard; larger margins → tighter clusters but slower convergence |
| Scale `s` | 64 | Compensates for the angular margin compressing logits |
| Embedding dim | 512 | Matches existing MobileFaceNet output — no change needed |

Implementation: use `pytorch-metric-learning` `ArcFaceLoss` or implement directly (30 lines). Do NOT use `torch.nn.CrossEntropyLoss` — it has no angular margin and won't tighten clusters.

---

## Training Configuration

```python
optimizer    = AdamW(lr=1e-4, weight_decay=1e-4)
scheduler    = CosineAnnealingLR(T_max=30, eta_min=1e-6)
epochs       = 30
batch_size   = 64  # reduce to 32 if OOM
input_size   = (112, 112)
num_classes  = N_identities  # set dynamically from dataset
loss         = ArcFaceLoss(m=0.5, s=64)
val_every    = 5 epochs
early_stop   = if val TAR@0.92 doesn't improve for 10 epochs
checkpoint   = save best val TAR@0.92
```

On CPU (no GPU): batch_size=32, expect ~4–8 min/epoch for 15k images. 30 epochs ≈ 2–4 hours.
On GPU: ~20 min total.

---

## Validation Protocol

After each val checkpoint, run the same similarity distribution check as `test_model.py`:

```
Same-pair mean  ≥ 0.80  → on track
Same-pair mean  ≥ 0.85  → target met, continue to 0.90
FAR at 0.92     ≤ 1%    → required
TAR at 0.92     ≥ 95%   → required
```

Use the `data/split_indian/val/` split — pairs built the same way as test_model.py (same + diff pairs per identity). Never evaluate on augmented images.

---

## Scripts Status

| Script | Purpose | Status |
|---|---|---|
| `ml/scripts/merge_datasets.py` | Merge + dedup Kaggle datasets into unified identity-folder layout | **Written + run** |
| `ml/scripts/align_dataset.py` | MTCNN-align every image to ArcFace canonical 112x112 | **Written, running** |
| `ml/scripts/finetune.py` | Main fine-tuning loop with ArcFace loss | **Written** |
| `ml/scripts/prepare_dataset.py` | train/val/test split + pose filter | Already existed; added `--skip_ita_filter` flag |
| `ml/augmentation/augment.py` | 10x augmentation pipeline | Already written |
| `ml/scripts/quantise.py` | INT8 TFLite quantisation | Already written |
| `ml/scripts/test_model.py` | Benchmark TAR/FAR | Already written |

---

## Schedule (4 days to deadline)

| Day | Task | Output |
|---|---|---|
| **Day 2 (today)** | Merge Kaggle datasets, write + run `align_dataset.py`, write `finetune.py`, run `prepare_dataset.py` + `augment.py` | `data/augmented_indian/` ready |
| **Day 3** | Run `finetune.py` (30 epochs), first checkpoint, iterate | First val metrics; best model saved |
| **Day 4** | Iterate threshold, re-quantise, run final `test_model.py` benchmark | Updated TFLite model hitting targets |
| **Day 5 (June 5)** | APK + submission checklist | Ship |

---

## Risk Register

| Risk | Probability | Mitigation |
|---|---|---|
| IMFDB download unavailable / slow | Medium | Fall back to LFW Indian subset + heavy augmentation (10×) alone |
| < 200 identities after filtering | Medium | Lower `--min_imgs` to 3, widen ITA threshold to 35° |
| Same-pair mean stuck < 0.75 after 30 epochs | Low | Unfreeze blocks 3-4, run 10 more epochs at lr=1e-5 |
| Quantisation drift drops below 0.90 after fine-tune | Low | Re-calibrate with `quantise.py --calib_dir` using Indian training images, not general ImageNet |
| No GPU, training too slow | Medium | Use Google Colab free tier (T4 GPU); push just the data + finetune.py |

---

## Definition of Done

A fine-tuned model is production-ready when ALL of the following pass on the Indian demographic test split:

- [ ] Same-pair mean cosine ≥ 0.85
- [ ] Diff-pair mean cosine ≤ 0.05  
- [ ] TAR (TPR) at threshold 0.92 ≥ 95%
- [ ] FAR (FPR) at threshold 0.92 ≤ 1%
- [ ] TFLite/ONNX quantisation drift ≥ 0.92 (no degradation from re-quantisation)
- [ ] `mobilefacenet_indian.tflite` passes the React Native bridge smoke test
