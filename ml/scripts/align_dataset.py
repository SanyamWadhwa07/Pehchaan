"""
MTCNN face alignment for ArcFace training.

Takes an identity-folder dataset and produces a new dataset where every image is:
  - Face detected by MTCNN
  - 5-point landmark aligned (eyes, nose, mouth corners)
  - Warped to ArcFace canonical 112x112

Images where MTCNN detects no face are dropped (logged to align_failures.txt).

Usage (run from repo root):
  python ml/scripts/align_dataset.py \
      --input_dir data/merged_indian \
      --output_dir data/aligned_indian \
      --workers 4
"""

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

try:
    from mtcnn import MTCNN
except ImportError:
    sys.exit("Run: pip install mtcnn")


IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# ArcFace canonical 5-point landmarks for 112x112
_ARCFACE_DST = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float32)

# Thread-local MTCNN detector (one per worker thread)
import threading
_local = threading.local()


def _get_detector() -> MTCNN:
    if not hasattr(_local, "detector"):
        _local.detector = MTCNN()
    return _local.detector


def align_face(img_bgr: np.ndarray) -> np.ndarray | None:
    """Detect + align a single face. Returns 112x112 BGR array or None."""
    detector = _get_detector()
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    results = detector.detect_faces(rgb)
    if not results:
        return None

    # Pick largest face by bounding box area
    best = max(results, key=lambda r: r["box"][2] * r["box"][3])
    kp = best["keypoints"]

    src_pts = np.array([
        kp["left_eye"],
        kp["right_eye"],
        kp["nose"],
        kp["mouth_left"],
        kp["mouth_right"],
    ], dtype=np.float32)

    M, _ = cv2.estimateAffinePartial2D(src_pts, _ARCFACE_DST, method=cv2.LMEDS)
    if M is None:
        return None

    aligned = cv2.warpAffine(img_bgr, M, (112, 112), flags=cv2.INTER_LINEAR)
    return aligned


def process_image(args: tuple) -> tuple[bool, str]:
    """Worker: align one image. Returns (success, reason_if_failed)."""
    src_path, dst_path = args
    try:
        img = cv2.imread(str(src_path))
        if img is None:
            return False, f"unreadable: {src_path}"

        aligned = align_face(img)
        if aligned is None:
            return False, f"no_face: {src_path}"

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(dst_path), aligned)
        return True, ""
    except Exception as e:
        return False, f"error: {src_path} — {e}"


def align_dataset(input_dir: Path, output_dir: Path, workers: int) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect all (src, dst) pairs
    pairs: list[tuple[Path, Path]] = []
    for src in sorted(input_dir.rglob("*")):
        if src.suffix.lower() not in IMG_EXTS:
            continue
        rel = src.relative_to(input_dir)
        dst = output_dir / rel.parent / (rel.stem + ".jpg")
        pairs.append((src, dst))

    print(f"Aligning {len(pairs)} images from {input_dir} -> {output_dir}")
    print(f"Workers: {workers}")

    failures = []
    success_count = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(process_image, p): p for p in pairs}
        with tqdm(total=len(pairs), unit="img") as pbar:
            for future in as_completed(futures):
                ok, reason = future.result()
                if ok:
                    success_count += 1
                else:
                    failures.append(reason)
                pbar.update(1)
                pbar.set_postfix(ok=success_count, fail=len(failures))

    # Write failure log
    fail_log = output_dir / "align_failures.txt"
    with open(fail_log, "w") as f:
        f.write("\n".join(failures))

    drop_pct = 100 * len(failures) / max(len(pairs), 1)
    print(f"\nDone.")
    print(f"  Aligned:  {success_count}")
    print(f"  Dropped:  {len(failures)} ({drop_pct:.1f}%)")
    print(f"  Failures: {fail_log}")
    print(f"\nNext: python ml/scripts/prepare_dataset.py --input_dir {output_dir} --output_dir data/split_indian --skip_ita_filter")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MTCNN-align a face dataset to ArcFace canonical 112x112")
    parser.add_argument("--input_dir", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--workers", type=int, default=4,
                        help="Thread workers for parallel alignment (default 4)")
    args = parser.parse_args()

    align_dataset(Path(args.input_dir), Path(args.output_dir), args.workers)
