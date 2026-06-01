"""
Model accuracy test on LFW (Labeled Faces in the Wild) — standard face
verification benchmark. Downloads ~30 MB of face images automatically.

Run from repo root:
    python ml/scripts/test_model.py

Tests:
  1. TFLite INT8 model  (mobilefacenet_indian.tflite)
  2. ONNX FP32 model    (mobilefacenet_base.onnx)
  3. Side-by-side accuracy comparison at multiple thresholds
  4. Embedding drift: FP32 vs INT8 cosine difference

Outputs:
  - Accuracy / TAR / FAR at 0.80, 0.85, 0.92 thresholds
  - Confusion matrix numbers (TP / TN / FP / FN)
  - Quantisation drift report
"""

import sys
import subprocess
from pathlib import Path
import numpy as np
import cv2

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
TFLITE_MODEL = MODELS_DIR / "mobilefacenet_indian.tflite"
ONNX_MODEL   = MODELS_DIR / "mobilefacenet_base.onnx"

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "lfw_test"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Local LFW parquet — place at ml/train-00000-of-00001.parquet
# Schema: label (int identity ID), image (dict with 'bytes' key)
LFW_PARQUET = Path(__file__).resolve().parents[1] / "train-00000-of-00001.parquet"

INPUT_H, INPUT_W = 112, 112
THRESHOLDS = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.92]


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------

def curl_download(url: str, dest: Path, desc: str) -> bool:
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  [cached] {desc}")
        return True
    print(f"  Downloading {desc} ...", end="", flush=True)
    r = subprocess.run(
        ["curl", "-L", "--max-time", "120", "-o", str(dest), url],
        capture_output=True
    )
    if r.returncode != 0 or not dest.exists():
        print(f" FAILED\n  {r.stderr.decode()[:200]}")
        return False
    print(f" done ({dest.stat().st_size / 1e6:.1f} MB)")
    return True


def load_lfw_from_parquet() -> tuple[list, list]:
    """
    Load LFW from local parquet file (ml/train-00000-of-00001.parquet).
    Schema: label (int identity ID), image (dict with 'bytes' key).
    Returns (same_pairs, diff_pairs) where each entry is (bytes, bytes, label).
    """
    import pyarrow.parquet as pq

    if not LFW_PARQUET.exists():
        print(f"  [FAIL] Parquet not found: {LFW_PARQUET}")
        print("         Place ml/train-00000-of-00001.parquet from HuggingFace LFW dataset")
        return [], []

    print(f"  Reading {LFW_PARQUET.name} ({LFW_PARQUET.stat().st_size/1e6:.1f} MB)...")
    table = pq.read_table(LFW_PARQUET)
    images_col = table["image"].to_pylist()
    labels_col = table["label"].to_pylist()

    all_records = []
    for img_entry, lbl in zip(images_col, labels_col):
        img_bytes = img_entry.get("bytes") if isinstance(img_entry, dict) else img_entry
        if img_bytes:
            all_records.append((lbl, img_bytes))

    print(f"  Loaded {len(all_records)} images, "
          f"{len(set(r[0] for r in all_records))} unique identities")
    if not all_records:
        return [], []

    # Group by identity
    from collections import defaultdict
    identity_map = defaultdict(list)
    for name, img_bytes in all_records:
        identity_map[name].append(img_bytes)

    # Build same pairs: identities with ≥2 images
    same_pairs = []
    for name, imgs in identity_map.items():
        if len(imgs) >= 2:
            same_pairs.append((imgs[0], imgs[1], 1))
        if len(same_pairs) >= 600:
            break

    # Build diff pairs: random cross-identity pairs
    import random
    random.seed(42)
    identities = list(identity_map.keys())
    diff_pairs = []
    attempts = 0
    while len(diff_pairs) < min(600, len(same_pairs)) and attempts < 5000:
        a, b = random.sample(identities, 2)
        diff_pairs.append((identity_map[a][0], identity_map[b][0], 0))
        attempts += 1

    print(f"  Built {len(same_pairs)} same-pairs, {len(diff_pairs)} diff-pairs")
    return same_pairs, diff_pairs


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def preprocess_fp32(img_bgr: np.ndarray) -> np.ndarray:
    """112x112 BGR -> [1,3,112,112] float32 in [-1,1] (NCHW for ONNX)."""
    img = cv2.resize(img_bgr, (INPUT_W, INPUT_H))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    arr = img.astype(np.float32) / 127.5 - 1.0
    return arr.transpose(2, 0, 1)[np.newaxis]   # NHWC -> NCHW


def preprocess_int8(img_bgr: np.ndarray) -> np.ndarray:
    """112x112 BGR -> [1,112,112,3] int8 (NHWC for TFLite)."""
    img = cv2.resize(img_bgr, (INPUT_W, INPUT_H))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    arr = img.astype(np.float32) / 127.5 - 1.0  # [-1, 1]
    arr = np.clip(arr * 127.0, -128, 127).astype(np.int8)
    return arr[np.newaxis]  # NHWC


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a.flatten(), b.flatten()
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


# ---------------------------------------------------------------------------
# Model wrappers
# ---------------------------------------------------------------------------

class TFLiteModel:
    def __init__(self, path: Path):
        try:
            from ai_edge_litert.interpreter import Interpreter
        except ImportError:
            import tensorflow as tf
            Interpreter = tf.lite.Interpreter
        self.interp = Interpreter(model_path=str(path))
        self.interp.allocate_tensors()
        self.inp = self.interp.get_input_details()[0]
        self.out = self.interp.get_output_details()[0]
        # Cache quantization params so embed() can dequantize output
        out_q = self.out.get("quantization", (0.0, 0))
        self._out_scale, self._out_zp = float(out_q[0]), int(out_q[1])
        inp_q = self.inp.get("quantization", (1.0 / 127.0, 0))
        self._inp_scale, self._inp_zp = float(inp_q[0]), int(inp_q[1])
        print(f"    TFLite quant — input: scale={self._inp_scale:.5f} zp={self._inp_zp} | "
              f"output: scale={self._out_scale:.5f} zp={self._out_zp}")

    def embed(self, img_bgr: np.ndarray) -> np.ndarray:
        # Quantize input using model's actual scale/zero_point
        img = cv2.resize(img_bgr, (INPUT_W, INPUT_H))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        arr_f = img.astype(np.float32) / 127.5 - 1.0  # [-1, 1]
        if self._inp_scale != 0:
            arr_q = np.round(arr_f / self._inp_scale + self._inp_zp)
        else:
            arr_q = arr_f * 127.0
        tensor = np.clip(arr_q, -128, 127).astype(np.int8)[np.newaxis]  # NHWC
        self.interp.set_tensor(self.inp["index"], tensor)
        self.interp.invoke()
        raw = self.interp.get_tensor(self.out["index"])
        # Dequantize int8 output → float32
        if self._out_scale != 0:
            return (raw.astype(np.float32) - self._out_zp) * self._out_scale
        return raw.astype(np.float32)


class OnnxModel:
    def __init__(self, path: Path):
        import onnxruntime as rt
        self.sess = rt.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.input_name = self.sess.get_inputs()[0].name

    def embed(self, img_bgr: np.ndarray) -> np.ndarray:
        tensor = preprocess_fp32(img_bgr)
        return self.sess.run(None, {self.input_name: tensor})[0]


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

# MTCNN for 5-point landmark alignment (how MobileFaceNet/ArcFace was trained).
# Falls back to Haar cascade if mtcnn is not installed, with a warning.
try:
    from mtcnn import MTCNN as _MTCNN
    _DETECTOR = _MTCNN()
    _USE_MTCNN = True
except ImportError:
    _DETECTOR = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    _USE_MTCNN = False
    print("[WARN] mtcnn not installed — using Haar cascade (similarity scores will be ~0.15–0.20 lower)")
    print("       Fix: pip install mtcnn")

# ArcFace canonical 5-point reference positions for 112×112 output
_ARCFACE_DST = np.float32([
    [38.2946, 51.6963],   # left eye
    [73.5318, 51.5014],   # right eye
    [56.0252, 71.7366],   # nose tip
    [41.5493, 92.3655],   # mouth left
    [70.7299, 92.2041],   # mouth right
])


def decode_img(img_bytes: bytes) -> np.ndarray | None:
    """Decode JPEG/PNG bytes → 112×112 BGR face crop.

    MTCNN path: detects 5 landmarks, applies similarity transform so the face
    lands exactly on the ArcFace canonical positions — the same alignment used
    during MobileFaceNet training.  Pairs where MTCNN finds no face are dropped
    (returning None) rather than falling back to a noisy crop, because misaligned
    faces push same-pair similarity down and corrupt the threshold sweep.

    Haar fallback: used only when mtcnn is not installed.
    """
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    if _USE_MTCNN:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = _DETECTOR.detect_faces(rgb)
        if not results:
            return None
        kp = results[0]["keypoints"]
        src = np.float32([
            kp["left_eye"], kp["right_eye"],
            kp["nose"], kp["mouth_left"], kp["mouth_right"],
        ])
        M = cv2.estimateAffinePartial2D(src, _ARCFACE_DST)[0]
        if M is None:
            return None
        return cv2.warpAffine(img, M, (INPUT_W, INPUT_H))

    # Haar fallback -------------------------------------------------------
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _DETECTOR.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    if len(faces) > 0:
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        margin = int(0.2 * max(w, h))
        x1 = max(0, x - margin)
        y1 = max(0, y - margin)
        x2 = min(img.shape[1], x + w + margin)
        y2 = min(img.shape[0], y + h + margin)
        img = img[y1:y2, x1:x2]
    else:
        h, w = img.shape[:2]
        side = min(h, w)
        y0 = (h - side) // 2
        x0 = (w - side) // 2
        img = img[y0:y0+side, x0:x0+side]
    return img


def evaluate(model, pairs: list) -> tuple[list, list]:
    """Returns (similarities, labels). Each pair is (bytes, bytes, label)."""
    sims, labels = [], []
    for b1, b2, label in pairs:
        img1 = decode_img(b1)
        img2 = decode_img(b2)
        if img1 is None or img2 is None:
            continue
        e1 = model.embed(img1)
        e2 = model.embed(img2)
        sims.append(cosine(e1, e2))
        labels.append(label)
    return sims, labels


def report(name: str, sims: list, labels: list) -> None:
    sims   = np.array(sims)
    labels = np.array(labels)
    same_sims = sims[labels == 1]
    diff_sims = sims[labels == 0]

    print(f"\n{'='*55}")
    print(f"  {name}")
    print(f"{'='*55}")
    print(f"  Pairs evaluated:  {len(sims)}  ({labels.sum()} same / {(labels==0).sum()} diff)")
    print()
    print(f"  *** SIMILARITY DISTRIBUTION (key diagnostic) ***")
    print(f"  Same-pair  sim:   mean={same_sims.mean():.4f}  std={same_sims.std():.4f}  "
          f"min={same_sims.min():.4f}  max={same_sims.max():.4f}")
    print(f"  Diff-pair  sim:   mean={diff_sims.mean():.4f}  std={diff_sims.std():.4f}  "
          f"min={diff_sims.min():.4f}  max={diff_sims.max():.4f}")
    separation = same_sims.mean() - diff_sims.mean()
    print(f"  Separation (same_mean - diff_mean): {separation:.4f}  "
          f"{'[ok - model discriminates]' if separation > 0.05 else '[WARN - poor separation, model may be broken]'}")

    # Find optimal threshold (max accuracy sweep)
    best_acc, best_thr = 0.0, 0.0
    for thr_sweep in np.arange(-1.0, 1.0, 0.01):
        preds = (sims >= thr_sweep).astype(int)
        acc_s = ((preds == labels).sum()) / len(labels) * 100
        if acc_s > best_acc:
            best_acc, best_thr = acc_s, float(thr_sweep)
    print(f"\n  *** OPTIMAL threshold: {best_thr:.2f}  →  best accuracy {best_acc:.2f}% ***")
    print(f"  (0.92 is the POST-FINE-TUNE target — base model will be lower)")
    print()

    print(f"\n  {'Threshold':>9}  {'Accuracy':>8}  {'TAR(TPR)':>9}  {'FAR(FPR)':>9}  "
          f"{'TP':>5}  {'TN':>5}  {'FP':>5}  {'FN':>5}")
    print(f"  {'-'*70}")
    for thr in THRESHOLDS:
        preds  = (sims >= thr).astype(int)
        tp = int(((preds == 1) & (labels == 1)).sum())
        tn = int(((preds == 0) & (labels == 0)).sum())
        fp = int(((preds == 1) & (labels == 0)).sum())
        fn = int(((preds == 0) & (labels == 1)).sum())
        acc = (tp + tn) / len(labels) * 100
        tar = tp / (tp + fn + 1e-8) * 100
        far = fp / (fp + tn + 1e-8) * 100
        marker = " ← optimal" if abs(thr - best_thr) < 0.015 else ""
        print(f"  {thr:>9.2f}  {acc:>7.2f}%  {tar:>8.2f}%  {far:>8.2f}%  "
              f"{tp:>5}  {tn:>5}  {fp:>5}  {fn:>5}{marker}")


def drift_report(tflite_model: TFLiteModel, onnx_model: OnnxModel, pairs: list) -> None:
    """Compare INT8 TFLite vs FP32 ONNX embeddings on same inputs."""
    print(f"\n{'='*55}")
    print("  Quantisation Drift: TFLite INT8 vs ONNX FP32")
    print(f"{'='*55}")
    drifts = []
    sample_pairs = pairs[:50]  # 50 pairs = 100 images
    for b1, b2, _ in sample_pairs:
        for raw in [b1, b2]:
            img = decode_img(raw)
            if img is None:
                continue
            e_tflite = tflite_model.embed(img).flatten()
            e_onnx   = onnx_model.embed(img).flatten()

            # Normalise before comparing (they have different output scales)
            e_tflite = e_tflite / (np.linalg.norm(e_tflite) + 1e-8)
            e_onnx_n = e_onnx   / (np.linalg.norm(e_onnx)   + 1e-8)

            # TFLite output is 512-dim, ONNX may also be 512-dim — align dims
            min_dim = min(len(e_tflite), len(e_onnx_n))
            sim = float(np.dot(e_tflite[:min_dim], e_onnx_n[:min_dim]))
            drifts.append(sim)

    drifts = np.array(drifts)
    print(f"  Samples:            {len(drifts)} embeddings")
    print(f"  TFLite/ONNX cosine: mean={drifts.mean():.4f}  std={drifts.std():.4f}  "
          f"min={drifts.min():.4f}  max={drifts.max():.4f}")
    if drifts.mean() > 0.90:
        print("  [ok] Quantisation drift acceptable (>0.90 mean cosine)")
    elif drifts.mean() > 0.80:
        print("  [WARN] Moderate drift — consider re-quantising with real calibration data")
    else:
        print("  [FAIL] High drift — quantisation degraded the model significantly")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== Pehchaan — MobileFaceNet Model Accuracy Test ===\n")

    for m in [TFLITE_MODEL, ONNX_MODEL]:
        if not m.exists():
            print(f"[FAIL] Missing: {m}")
            sys.exit(1)

    # Download data
    print("[1/4] Fetching LFW data from HuggingFace...")
    print("[2/4] Loading pairs from parquet shards...")
    same_pairs, diff_pairs = load_lfw_from_parquet()
    all_pairs = same_pairs + diff_pairs
    print(f"  Using {len(same_pairs)} same-person pairs, {len(diff_pairs)} diff-person pairs")

    if not all_pairs:
        print("[FAIL] No pairs loaded — check LFW download")
        sys.exit(1)

    # Load models
    print("\n[3/4] Loading models...")
    print("  Loading TFLite INT8...", end="", flush=True)
    tflite = TFLiteModel(TFLITE_MODEL)
    print(" ok")
    print("  Loading ONNX FP32...", end="", flush=True)
    onnx = OnnxModel(ONNX_MODEL)
    print(" ok")

    # Evaluate
    print("\n[4/4] Running inference on all pairs...")
    print("  TFLite INT8...", end="", flush=True)
    tflite_sims, labels = evaluate(tflite, all_pairs)
    print(f" done ({len(tflite_sims)} pairs)")

    print("  ONNX FP32...", end="", flush=True)
    onnx_sims, _ = evaluate(onnx, all_pairs)
    print(f" done ({len(onnx_sims)} pairs)")

    # Reports
    report("TFLite INT8 — mobilefacenet_indian.tflite", tflite_sims, labels)
    report("ONNX FP32   — mobilefacenet_base.onnx",    onnx_sims,   labels)
    drift_report(tflite, onnx, same_pairs[:50])

    print(f"\n{'='*55}")
    print("  NOTE: LFW is a general (mostly Western) benchmark.")
    print("  Indian demographic FAR/FRR tuning is Day 3 task.")
    print("  These numbers establish the base model baseline.")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
