"""
Inference speed benchmark for MobileFaceNet.
Measures: MTCNN detect, ONNX embed, end-to-end pipeline on CPU.

Run from repo root:
    D:\\Pehchaan\\ml\\venv\\Scripts\\python.exe ml/scripts/benchmark.py
    D:\\Pehchaan\\ml\\venv\\Scripts\\python.exe ml/scripts/benchmark.py --model ml/models/finetuned/mobilefacenet_indian_ft.onnx
"""

import argparse
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as rt

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
INPUT_H, INPUT_W = 112, 112
WARMUP_RUNS = 10
BENCH_RUNS = 100


def make_dummy_face() -> np.ndarray:
    """Synthetic 112x112 BGR face crop for pure inference benchmarking."""
    rng = np.random.default_rng(42)
    return (rng.uniform(0, 255, (INPUT_H, INPUT_W, 3))).astype(np.uint8)


def make_dummy_raw_frame() -> np.ndarray:
    """Synthetic 720p BGR frame for end-to-end pipeline benchmarking."""
    rng = np.random.default_rng(42)
    return (rng.uniform(0, 255, (720, 1280, 3))).astype(np.uint8)


def preprocess(img_bgr: np.ndarray) -> np.ndarray:
    img = cv2.resize(img_bgr, (INPUT_W, INPUT_H))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    arr = img.astype(np.float32) / 127.5 - 1.0
    return arr.transpose(2, 0, 1)[np.newaxis]


def bench(label: str, fn, runs: int = BENCH_RUNS):
    # warmup
    for _ in range(WARMUP_RUNS):
        fn()
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        fn()
        times.append((time.perf_counter() - t0) * 1000)
    times = np.array(times)
    print(f"  {label:<40}  mean={times.mean():6.1f}ms  "
          f"p50={np.percentile(times,50):6.1f}ms  "
          f"p95={np.percentile(times,95):6.1f}ms  "
          f"min={times.min():6.1f}ms")
    return times


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(MODELS_DIR / "mobilefacenet_base.onnx"))
    parser.add_argument("--runs", type=int, default=BENCH_RUNS)
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"[FAIL] Model not found: {model_path}")
        return

    print(f"=== Pehchaan — Inference Speed Benchmark ===")
    print(f"Model: {model_path.name} ({model_path.stat().st_size/1e6:.1f} MB)")
    print(f"Runs:  {args.runs} (+ {WARMUP_RUNS} warmup)")
    print(f"Note:  CPU-only (CPUExecutionProvider). "
          f"Mobile CPU will be ~2-4x slower than this machine.\n")

    # Load ONNX session (CPU only — simulates mobile)
    sess = rt.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    dummy_face = make_dummy_face()
    dummy_frame = make_dummy_raw_frame()

    print(f"  {'Operation':<40}  {'mean':>8}  {'p50':>8}  {'p95':>8}  {'min':>8}")
    print(f"  {'-'*72}")

    # 1. Pure ONNX embed (preprocessed input already ready)
    tensor = preprocess(dummy_face)
    embed_times = bench(
        "ONNX embed only (512-d)",
        lambda: sess.run(None, {input_name: tensor}),
        args.runs,
    )

    # 2. Preprocess + embed
    preprocess_embed_times = bench(
        "Preprocess + ONNX embed",
        lambda: sess.run(None, {input_name: preprocess(dummy_face)}),
        args.runs,
    )

    # 3. MTCNN detect on a full frame
    try:
        import os; os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
        os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
        from mtcnn import MTCNN
        detector = MTCNN()
        rgb_frame = cv2.cvtColor(dummy_frame, cv2.COLOR_BGR2RGB)
        detect_times = bench(
            "MTCNN detect (720p frame)",
            lambda: detector.detect_faces(rgb_frame),
            min(args.runs, 30),  # MTCNN is slow — fewer runs
        )
    except ImportError:
        print(f"  {'MTCNN detect':<40}  [SKIP] mtcnn not installed")
        detect_times = None

    # 4. End-to-end: MTCNN detect + align + embed
    if detect_times is not None:
        from mtcnn import MTCNN
        _ARCFACE_DST = np.float32([
            [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
            [41.5493, 92.3655], [70.7299, 92.2041],
        ])
        rgb_frame = cv2.cvtColor(dummy_frame, cv2.COLOR_BGR2RGB)
        results = detector.detect_faces(rgb_frame)

        if results:
            kp = results[0]["keypoints"]
            src = np.float32([
                kp["left_eye"], kp["right_eye"], kp["nose"],
                kp["mouth_left"], kp["mouth_right"],
            ])
            M = cv2.estimateAffinePartial2D(src, _ARCFACE_DST)[0]

            def end_to_end():
                face = cv2.warpAffine(dummy_frame, M, (INPUT_W, INPUT_H))
                tensor = preprocess(face)
                return sess.run(None, {input_name: tensor})

            e2e_times = bench(
                "Align + embed (after detect)",
                end_to_end,
                args.runs,
            )
        else:
            print(f"  {'End-to-end':<40}  [SKIP] MTCNN found no face in dummy frame")

    print()
    print(f"=== Summary ===")
    print(f"  Pure embed mean:          {embed_times.mean():.1f} ms")
    print(f"  Preprocess+embed mean:    {preprocess_embed_times.mean():.1f} ms")
    if detect_times is not None:
        print(f"  MTCNN detect mean:        {detect_times.mean():.1f} ms")
        total_est = detect_times.mean() + preprocess_embed_times.mean()
        print(f"  Estimated end-to-end:     {total_est:.1f} ms  (detect + align + embed)")
        print()
        if total_est < 1000:
            print(f"  [ok] Estimated pipeline {total_est:.0f}ms on THIS machine (CPU only)")
        print(f"  Mobile device estimate:  ~{total_est*2:.0f}–{total_est*3:.0f}ms "
              f"(mid-range ARM CPU is ~2-3x slower)")
        print(f"  TFLite INT8 on device:   typically 50–150ms for MobileFaceNet")
        print()
    print(f"  To get the REAL number: use TFLite benchmark tool on Android device.")
    print(f"  See instructions below.\n")
    print(f"--- TFLite on-device benchmark (run after TFLite CI completes) ---")
    print(f"  1. Download TFLite benchmark binary:")
    print(f"     https://www.tensorflow.org/lite/performance/measurement")
    print(f"  2. Push to device:")
    print(f"     adb push mobilefacenet_indian.tflite /data/local/tmp/")
    print(f"     adb push benchmark_model /data/local/tmp/ && adb shell chmod +x /data/local/tmp/benchmark_model")
    print(f"  3. Run:")
    print(f"     adb shell /data/local/tmp/benchmark_model \\")
    print(f"       --graph=/data/local/tmp/mobilefacenet_indian.tflite \\")
    print(f"       --num_threads=4 --num_runs=50")
    print(f"  4. Look for 'Inference timings' -> avg_ms in the output")


if __name__ == "__main__":
    main()
