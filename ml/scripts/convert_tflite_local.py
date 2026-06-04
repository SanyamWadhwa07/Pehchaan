"""
Local TFLite INT8 conversion using real face images for calibration.
Uses data/aligned_indian/ (35k real aligned faces) — much better than random noise.

Run from repo root:
  ml\\venv\\Scripts\\python.exe ml/scripts/convert_tflite_local.py

Output: ml/models/mobilefacenet_indian.tflite
"""

import os
import random
import shutil
import sys
import tempfile
import warnings
from pathlib import Path

import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

REPO = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO / "ml" / "models"
ONNX_SRC = MODELS_DIR / "finetuned" / "mobilefacenet_indian_ft.onnx"
TFLITE_OUT = MODELS_DIR / "mobilefacenet_indian.tflite"
CALIB_DIR = REPO / "data" / "aligned_indian"
NUM_CALIB = 300

if not ONNX_SRC.exists():
    print(f"[FAIL] ONNX model not found: {ONNX_SRC}")
    sys.exit(1)

# Collect real face images for calibration
exts = {".jpg", ".jpeg", ".png", ".bmp"}
all_imgs = [p for p in CALIB_DIR.rglob("*") if p.suffix.lower() in exts]
if len(all_imgs) < 50:
    print(f"[WARN] Only {len(all_imgs)} calibration images found in {CALIB_DIR}")
    print("       Falling back to random noise calibration")
    use_real = False
else:
    random.seed(42)
    calib_imgs = random.sample(all_imgs, min(NUM_CALIB, len(all_imgs)))
    use_real = True
    print(f"[ok] Calibration: {len(calib_imgs)} real face images from {len(all_imgs)} available")

print(f"[ok] Source: {ONNX_SRC.name} ({ONNX_SRC.stat().st_size / 1e6:.1f} MB)")
print("\n[1/3] FP32 ONNX -> TF SavedModel via onnx2tf...")

import onnx2tf
import onnx2tf.onnx2tf as _onnx2tf_mod
import onnx2tf.utils.common_functions as _cf
import tensorflow as tf
from PIL import Image

# Patch onnx2tf's download_test_image_data — it tries to load a pickled .npy from GitHub
_stub = lambda: np.zeros((1, 3, 112, 112), dtype=np.float32)
_cf.download_test_image_data = _stub
_onnx2tf_mod.download_test_image_data = _stub

tmp = tempfile.mkdtemp(prefix="pehchaan_")
try:
    onnx2tf.convert(
        input_onnx_file_path=str(ONNX_SRC),
        output_folder_path=tmp,
        batch_size=1,
        non_verbose=True,
        output_signaturedefs=True,
    )
    print(f"      SavedModel written to {tmp}")

    print("\n[2/3] Applying INT8 PTQ quantisation with real face calibration...")

    sm = tf.saved_model.load(tmp)
    infer = sm.signatures["serving_default"]
    input_key = list(infer.structured_input_signature[1].keys())[0]
    print(f"      Input key: '{input_key}'")

    def preprocess(path: Path) -> np.ndarray:
        """Resize to 112×112, normalize [-1, 1], return NHWC float32."""
        img = Image.open(path).convert("RGB").resize((112, 112), Image.BILINEAR)
        arr = np.array(img, dtype=np.float32) / 127.5 - 1.0
        return arr[np.newaxis]  # (1, 112, 112, 3)

    def rep_dataset():
        if use_real:
            ok = 0
            for p in calib_imgs:
                try:
                    yield {input_key: preprocess(p)}
                    ok += 1
                except Exception:
                    pass
            print(f"      Used {ok}/{len(calib_imgs)} calibration images")
        else:
            rng = np.random.default_rng(42)
            for _ in range(200):
                yield {input_key: rng.uniform(-1, 1, (1, 112, 112, 3)).astype(np.float32)}

    converter = tf.lite.TFLiteConverter.from_saved_model(tmp)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.float32
    converter.representative_dataset = rep_dataset

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        tflite_model = converter.convert()

finally:
    shutil.rmtree(tmp, ignore_errors=True)

TFLITE_OUT.write_bytes(tflite_model)
size_mb = len(tflite_model) / 1e6

print(f"\n[3/3] Verifying TFLite inference...")
try:
    from ai_edge_litert.interpreter import Interpreter
    interp = Interpreter(model_content=tflite_model)
except ImportError:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        interp = tf.lite.Interpreter(model_content=tflite_model)

interp.allocate_tensors()
inp_d = interp.get_input_details()[0]
out_d = interp.get_output_details()[0]
dummy = np.random.randint(-128, 127, inp_d["shape"], dtype=np.int8)
interp.set_tensor(inp_d["index"], dummy)
interp.invoke()
emb = interp.get_tensor(out_d["index"])
print(f"      Inference ok — embedding shape: {emb.shape}")

print(f"\n--- Result ---")
print(f"  {TFLITE_OUT.name}: {size_mb:.2f} MB", end="  ")
if size_mb <= 16:
    print("[ok] under 16 MB limit")
else:
    print(f"[WARN] exceeds 16 MB — check quantisation settings")
    sys.exit(1)

print(f"\nNext: copy to src/native/FaceRecognition/assets/mobilefacenet_indian.tflite")
