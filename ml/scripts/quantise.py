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
SIZE_LIMIT_MB = 16.0

# MobileFaceNet: 112x112 RGB, normalised [-1, 1]
INPUT_H, INPUT_W, INPUT_C = 112, 112, 3
CALIB_SAMPLES = 200


def check_source(onnx_src: Path):
    if not onnx_src.exists():
        print(f"[FAIL] Source ONNX not found: {onnx_src}")
        print("       After fine-tuning: ml/models/finetuned/mobilefacenet_indian_ft.onnx")
        print("       Base model: ml/models/mobilefacenet_base.onnx")
        sys.exit(1)
    print(f"[ok] Source: {onnx_src.name} ({onnx_src.stat().st_size / 1e6:.1f} MB)")


def make_calibration_data(tmp_dir: str, onnx_src: Path, calib_dir_override: Path | None = None) -> str:
    """
    Write calibration images (synthetic face crops) for onnxruntime static PTQ.
    Pass --calib_dir to use real Indian demographic face crops for better accuracy.
    """
    import onnxruntime as rt

    sess = rt.InferenceSession(str(onnx_src), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    input_shape = sess.get_inputs()[0].shape  # e.g. [1, 3, 112, 112] NCHW

    # Resolve dynamic dims
    shape = [d if isinstance(d, int) and d > 0 else 1 for d in input_shape]

    calib_dir = Path(tmp_dir) / "calib"
    calib_dir.mkdir()

    # Use provided calib_dir, else fall back to augmented_indian/train
    real_images = []
    search_dirs = []
    if calib_dir_override and calib_dir_override.exists():
        search_dirs.append(calib_dir_override)
    else:
        for candidate in [
            MODELS_DIR.parent.parent / "data" / "augmented_indian" / "train",
            MODELS_DIR.parent.parent / "data" / "filtered_indian" / "train",
        ]:
            if candidate.exists():
                search_dirs.append(candidate)
                break
    if search_dirs:
        import cv2
        real_images = list(search_dirs[0].rglob("*.jpg"))[:CALIB_SAMPLES]
        print(f"      Using {len(real_images)} real face images from {search_dirs[0]}")

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


def quantise_onnx(calib_dir: str, onnx_src: Path, onnx_int8: Path) -> None:
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
    sess = rt.InferenceSession(str(onnx_src), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name

    quantize_static(
        model_input=str(onnx_src),
        model_output=str(onnx_int8),
        calibration_data_reader=NpyCalibReader(calib_dir, input_name),
        quant_format=QuantFormat.QOperator,
        per_channel=False,  # per-channel causes bias shape broadcast errors on MobileFaceNet
        weight_type=QuantType.QInt8,
        activation_type=QuantType.QUInt8,
    )

    size_mb = onnx_int8.stat().st_size / 1e6
    print(f"      INT8 ONNX written: {onnx_int8.name} ({size_mb:.2f} MB)")


def verify_onnx_int8(onnx_int8: Path) -> bool:
    """Run one inference on the INT8 ONNX to confirm it works."""
    print("\n[2/2] Verifying INT8 ONNX inference...")
    import onnxruntime as rt

    sess = rt.InferenceSession(str(onnx_int8), providers=["CPUExecutionProvider"])
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


def check_tflite_exists(tflite_out: Path):
    """Report whether the TFLite file exists (produced by Linux CI)."""
    print("\n--- TFLite status ---")
    if tflite_out.exists():
        size_mb = tflite_out.stat().st_size / 1e6
        status = "[ok]" if size_mb <= SIZE_LIMIT_MB else f"[WARN] exceeds {SIZE_LIMIT_MB} MB"
        print(f"  {tflite_out.name}: {size_mb:.2f} MB {status}")
    else:
        print(f"  {tflite_out.name}: not yet produced")
        print("  -> Trigger the tflite_convert CI job on GitHub Actions (Linux runner)")
        print("  -> Download artifact and place at ml/models/mobilefacenet_indian.tflite")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Quantise MobileFaceNet ONNX to INT8")
    parser.add_argument("--model", default=str(MODELS_DIR / "mobilefacenet_base.onnx"),
                        help="Input ONNX model (default: base model; after fine-tune pass finetuned/mobilefacenet_indian_ft.onnx)")
    parser.add_argument("--calib_dir", default=None,
                        help="Directory of real face images for calibration (optional, falls back to augmented_indian/train)")
    parser.add_argument("--output", default=str(MODELS_DIR / "mobilefacenet_indian_int8.onnx"),
                        help="Output INT8 ONNX path")
    parser.add_argument("--tflite_out", default=str(MODELS_DIR / "mobilefacenet_indian.tflite"),
                        help="Expected TFLite output path (checked for existence, not produced here)")
    args = parser.parse_args()

    onnx_src = Path(args.model)
    onnx_int8 = Path(args.output)
    tflite_out = Path(args.tflite_out)
    calib_dir_override = Path(args.calib_dir) if args.calib_dir else None

    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    print("=== Pehchaan — MobileFaceNet Quantisation ===\n")
    check_source(onnx_src)

    with tempfile.TemporaryDirectory(prefix="pehchaan_calib_") as tmp:
        calib_dir = make_calibration_data(tmp, onnx_src, calib_dir_override)
        quantise_onnx(calib_dir, onnx_src, onnx_int8)

    ok = verify_onnx_int8(onnx_int8)
    check_tflite_exists(tflite_out)

    print("\nNext steps:")
    if ok:
        print(f"  [ok] INT8 ONNX ready: {onnx_int8}")
        print("  [ ] Run: python ml/scripts/test_model.py --onnx_model <path> to verify FAR/FRR")
    print("  [ ] TFLite: push to GitHub -> Actions -> 'TFLite Convert' -> download artifact")
    print("  [ ] Wire mobilefacenet_indian.tflite into src/native/FaceRecognition/")


if __name__ == "__main__":
    main()
