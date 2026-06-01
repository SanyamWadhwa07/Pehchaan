"""
One-shot local TFLite conversion — run in WSL2, NOT Windows.
onnx2tf is Linux-only; WSL2 is the easiest way to run this on a Windows machine.

Setup (WSL2 terminal, run once):
  cd /mnt/d/Pehchaan/ml
  python3.12 -m venv venv_wsl
  source venv_wsl/bin/activate
  pip install tensorflow tf-keras onnx onnxruntime onnx-graphsurgeon \
              psutil ai-edge-litert sng4onnx onnx2tf

Run:
  source venv_wsl/bin/activate
  python scripts/convert_tflite_local.py

Output: ml/models/mobilefacenet_indian.tflite
  -> copy to src/native/FaceRecognition/assets/ for the RN bridge
"""

import os
import shutil
import sys
import tempfile
import warnings
from pathlib import Path

import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
ONNX_SRC = MODELS_DIR / "mobilefacenet_base.onnx"
TFLITE_OUT = MODELS_DIR / "mobilefacenet_indian.tflite"

if not ONNX_SRC.exists():
    print(f"[FAIL] ONNX model not found: {ONNX_SRC}")
    print("       Run: python scripts/download_models.py  first")
    sys.exit(1)

print(f"[ok] Source: {ONNX_SRC.name} ({ONNX_SRC.stat().st_size / 1e6:.1f} MB)")
print("\n[1/3] ONNX -> TF SavedModel via onnx2tf...")

import onnx2tf
import tensorflow as tf

tmp = tempfile.mkdtemp(prefix="pehchaan_")
try:
    onnx2tf.convert(
        input_onnx_file_path=str(ONNX_SRC),
        output_folder_path=tmp,
        batch_size=1,
        non_verbose=True,
    )
    print(f"      SavedModel written to {tmp}")

    print("\n[2/3] Applying INT8 PTQ quantisation...")

    # Discover the correct input key from the SavedModel signature
    sm = tf.saved_model.load(tmp)
    infer = sm.signatures["serving_default"]
    input_key = list(infer.structured_input_signature[1].keys())[0]
    input_spec = infer.structured_input_signature[1][input_key]
    shape = [d if isinstance(d, int) and d > 0 else 1
             for d in input_spec.shape.as_list()]
    print(f"      Input key: '{input_key}', shape: {shape}")

    rng = np.random.default_rng(42)

    def rep_dataset():
        for _ in range(200):
            yield {input_key: rng.uniform(-1, 1, shape).astype(np.float32)}

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
