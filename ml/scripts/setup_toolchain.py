"""
Pre-Sprint: Verify TFLite toolchain is correctly installed and working.
Run from repo root: python ml/scripts/setup_toolchain.py

Checks:
  1. Python version (3.9–3.12 required for TF 2.21)
  2. TensorFlow + TFLite converter
  3. OpenCV
  4. MediaPipe
  5. Albumentations
  6. GPU availability (optional — CPU is fine for INT8 quantisation)
  7. End-to-end smoke test: create a tiny TFLite model and run inference
"""

import sys


def check(label: str, fn):
    try:
        result = fn()
        print(f"  [ok] {label}" + (f" — {result}" if result else ""))
        return True
    except Exception as e:
        print(f"  [FAIL] {label}: {e}")
        return False


def main():
    print("=== Pehchaan — TFLite Toolchain Verification ===\n")
    failures = []

    # Python version
    major, minor = sys.version_info[:2]
    ok = major == 3 and 9 <= minor <= 12
    print(f"  {'[ok]' if ok else '[WARN]'} Python {major}.{minor}" +
          ("" if ok else " — TF 2.21 supports 3.9–3.12"))

    # TensorFlow
    if not check("TensorFlow", lambda: __import__("tensorflow").__version__):
        failures.append("pip install tensorflow>=2.20.0")

    # TFLite converter smoke test
    def tflite_smoke():
        import tensorflow as tf
        import numpy as np

        # Tiny model: single dense layer
        inp = tf.keras.Input(shape=(128,), name="input_1")
        out = tf.keras.layers.Dense(64, activation="relu")(inp)
        model = tf.keras.Model(inp, out)

        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.int8]
        # Use positional list — avoids tensor name mismatches across TF versions
        converter.representative_dataset = lambda: (
            [np.random.rand(1, 128).astype("float32")] for _ in range(100)
        )
        tflite_model = converter.convert()

        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            interpreter = tf.lite.Interpreter(model_content=tflite_model)  # type: ignore[attr-defined]

        interpreter.allocate_tensors()
        inp_details = interpreter.get_input_details()
        out_details = interpreter.get_output_details()
        interpreter.set_tensor(inp_details[0]["index"], np.random.rand(1, 128).astype("float32"))
        interpreter.invoke()
        result = interpreter.get_tensor(out_details[0]["index"])
        return f"INT8 inference ok, output shape {result.shape}"

    if not check("TFLite converter + INT8 inference (smoke test)", tflite_smoke):
        failures.append("TFLite smoke test failed — check TF install")

    # OpenCV
    if not check("OpenCV", lambda: __import__("cv2").__version__):
        failures.append("pip install opencv-python-headless==4.9.0.80")

    # MediaPipe
    if not check("MediaPipe", lambda: __import__("mediapipe").__version__):
        failures.append("pip install mediapipe>=0.10.30")

    # Albumentations
    if not check("Albumentations", lambda: __import__("albumentations").__version__):
        failures.append("pip install albumentations==1.3.1")

    # NumPy
    if not check("NumPy", lambda: __import__("numpy").__version__):
        failures.append("pip install numpy==1.24.4")

    # GPU (optional)
    def gpu_check():
        import tensorflow as tf
        gpus = tf.config.list_physical_devices("GPU")
        return f"{len(gpus)} GPU(s) detected" if gpus else "no GPU — CPU mode (fine for INT8 PTQ)"

    check("GPU availability", gpu_check)

    print()
    if failures:
        print("Fix the following, then re-run:")
        for f in failures:
            print(f"  {f}")
        print("\nOr install everything at once:")
        print("  pip install -r ml/requirements.txt")
    else:
        print("Toolchain ready. Proceed to:")
        print("  1. python ml/scripts/download_models.py")
        print("  2. python ml/scripts/prepare_dataset.py  (Day 1)")
        print("  3. python ml/scripts/quantise.py          (Day 1)")


if __name__ == "__main__":
    main()
