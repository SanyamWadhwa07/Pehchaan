"""
Day 1: MobileFaceNet quantisation pipeline.
Run from ml/ directory: python scripts/quantise.py

Two-stage pipeline:
  Stage 1 (all platforms): onnxruntime static INT8 quantisation
    mobilefacenet_base.onnx -> mobilefacenet_indian_int8.onnx

  Stage 2 (Linux CI only): onnx2tf ONNX -> TFLite INT8
    mobilefacenet_indian_int8.onnx -> mobilefacenet_indian.tflite
    (Run via GitHub Actions — see .github/workflows/tflite_convert.yml)

On Windows (dev machines), Stage 1 alone is enough to:
  - Verify quantisation quality / FAR-FRR
  - Benchmark inference latency with onnxruntime
The .tflite file is produced by CI and downloaded as an artifact.
"""

import os
import sys
import tempfile
import warnings
from pathlib import Path

import numpy as np

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
ONNX_SRC = MODELS_DIR / "mobilefacenet_base.onnx"
ONNX_INT8 = MODELS_DIR / "mobilefacenet_indian_int8.onnx"
TFLITE_OUT = MODELS_DIR / "mobilefacenet_indian.tflite"
SIZE_LIMIT_MB = 16.0

# MobileFaceNet: 112x112 RGB, normalised [-1, 1]
INPUT_H, INPUT_W, INPUT_C = 112, 112, 3
CALIB_SAMPLES = 200


def check_source():
    if not ONNX_SRC.exists():
        print(f"[FAIL] Source ONNX not found: {ONNX_SRC}")
        print("       Run: python scripts/download_models.py")
        sys.exit(1)
    print(f"[ok] Source: {ONNX_SRC.name} ({ONNX_SRC.stat().st_size / 1e6:.1f} MB)")


def make_calibration_data(tmp_dir: str) -> str:
    """
    Write calibration images (synthetic face crops) for onnxruntime static PTQ.
    In a real run, replace with actual Indian demographic face crops from
    data/filtered_indian/train/ — more representative data = better INT8 accuracy.
    """
    import onnxruntime as rt

    sess = rt.InferenceSession(str(ONNX_SRC), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    input_shape = sess.get_inputs()[0].shape  # e.g. [1, 3, 112, 112] NCHW

    # Resolve dynamic dims
    shape = [d if isinstance(d, int) and d > 0 else 1 for d in input_shape]

    calib_dir = Path(tmp_dir) / "calib"
    calib_dir.mkdir()

    # Check if real filtered data exists — use it if available
    real_data_dir = MODELS_DIR.parent.parent / "data" / "filtered_indian" / "train"
    real_images = []
    if real_data_dir.exists():
        import cv2
        real_images = list(real_data_dir.rglob("*.jpg"))[:CALIB_SAMPLES]
        print(f"      Using {len(real_images)} real face images for calibration")

    rng = np.random.default_rng(42)
    for i in range(CALIB_SAMPLES):
        if real_images and i < len(real_images):
            import cv2
            img = cv2.imread(str(real_images[i]))
            img = cv2.resize(img, (INPUT_W, INPUT_H))
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            arr = img.astype(np.float32) / 127.5 - 1.0  # [-1, 1]
            arr = arr.transpose(2, 0, 1)[np.newaxis]  # NHWC -> NCHW
        else:
            arr = rng.uniform(-1.0, 1.0, shape).astype(np.float32)

        np.save(str(calib_dir / f"calib_{i:04d}.npy"), arr)

    return str(calib_dir)


def quantise_onnx(calib_dir: str) -> None:
    """Static INT8 quantisation via onnxruntime."""
    print("\n[1/2] Applying onnxruntime static INT8 quantisation...")
    from onnxruntime.quantization import (
        CalibrationDataReader,
        QuantFormat,
        QuantType,
        quantize_static,
    )

    class NpyCalibReader(CalibrationDataReader):
        def __init__(self, calib_dir: str, input_name: str):
            self.files = sorted(Path(calib_dir).glob("*.npy"))
            self.input_name = input_name
            self._idx = 0

        def get_next(self):
            if self._idx >= len(self.files):
                return None
            data = {self.input_name: np.load(str(self.files[self._idx]))}
            self._idx += 1
            return data

    import onnxruntime as rt
    sess = rt.InferenceSession(str(ONNX_SRC), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name

    quantize_static(
        model_input=str(ONNX_SRC),
        model_output=str(ONNX_INT8),
        calibration_data_reader=NpyCalibReader(calib_dir, input_name),
        quant_format=QuantFormat.QOperator,
        per_channel=False,  # per-channel causes bias shape broadcast errors on MobileFaceNet
        weight_type=QuantType.QInt8,
        activation_type=QuantType.QUInt8,
    )

    size_mb = ONNX_INT8.stat().st_size / 1e6
    print(f"      INT8 ONNX written: {ONNX_INT8.name} ({size_mb:.2f} MB)")


def verify_onnx_int8() -> bool:
    """Run one inference on the INT8 ONNX to confirm it works."""
    print("\n[2/2] Verifying INT8 ONNX inference...")
    import onnxruntime as rt

    sess = rt.InferenceSession(str(ONNX_INT8), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    shape = [d if isinstance(d, int) and d > 0 else 1 for d in inp.shape]

    dummy = np.random.uniform(-1, 1, shape).astype(np.float32)
    outputs = sess.run(None, {inp.name: dummy})
    embedding = outputs[0]
    print(f"      Input: {inp.name} {shape} | Output embedding: {embedding.shape}")

    # Verify embedding is unit-normalisable (cosine sim prerequisite)
    norm = np.linalg.norm(embedding)
    print(f"      Embedding L2 norm: {norm:.4f} (should be > 0)")
    return norm > 0


def check_tflite_exists():
    """Report whether the TFLite file exists (produced by Linux CI)."""
    print("\n--- TFLite status ---")
    if TFLITE_OUT.exists():
        size_mb = TFLITE_OUT.stat().st_size / 1e6
        status = "[ok]" if size_mb <= SIZE_LIMIT_MB else f"[WARN] exceeds {SIZE_LIMIT_MB} MB"
        print(f"  {TFLITE_OUT.name}: {size_mb:.2f} MB {status}")
    else:
        print(f"  {TFLITE_OUT.name}: not yet produced")
        print("  -> Trigger the tflite_convert CI job on GitHub Actions (Linux runner)")
        print("  -> Download artifact and place at ml/models/mobilefacenet_indian.tflite")


def main():
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    print("=== Pehchaan — MobileFaceNet Quantisation ===\n")
    check_source()

    with tempfile.TemporaryDirectory(prefix="pehchaan_calib_") as tmp:
        calib_dir = make_calibration_data(tmp)
        quantise_onnx(calib_dir)

    ok = verify_onnx_int8()
    check_tflite_exists()

    print("\nNext steps:")
    if ok:
        print("  [ok] INT8 ONNX ready for benchmark — run: python scripts/benchmark.py")
    print("  [ ] TFLite: push to GitHub -> Actions -> 'TFLite Convert' -> download artifact")
    print("  [ ] Wire mobilefacenet_indian.tflite into src/native/FaceRecognition/ (Day 1 EOD)")


if __name__ == "__main__":
    main()
