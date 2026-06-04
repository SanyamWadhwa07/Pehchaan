"""
Extract South Asian / Indian demographic faces from MS1MV3 parquet.

Filters by ITA (Individual Typology Angle) < threshold → skin Type IV–VI (South Asian).
Keeps only identities with >= min_imgs images (required for ArcFace fine-tuning).

Usage (run from repo root):
    python ml/scripts/extract_indian_from_parquet.py \
        --parquet ml/train-00000-of-00001.parquet \
        --output_dir data/filtered_indian \
        --ita_threshold 28.0 \
        --min_imgs 2

Output layout (ready for augment.py and finetune.py):
    data/filtered_indian/
        <identity_id>/
            0000.jpg
            0001.jpg
            ...

After this, run:
    python ml/augmentation/augment.py \
        --input_dir data/filtered_indian \
        --output_dir data/augmented_indian \
        --augmentations_per_image 10

Reference: Del Bino et al., 2006 — ITA <28° = Fitzpatrick Type IV–VI (South Asian, East African)
"""

import argparse
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
import pyarrow.parquet as pq
from tqdm import tqdm

# ITA < 28° → Type IV–VI (South/South-East Asian, darker complexions)
DEFAULT_ITA_THRESHOLD = 28.0
# Minimum images per identity needed for fine-tuning (ArcFace needs pairs)
DEFAULT_MIN_IMGS = 2

INPUT_SIZE = 112  # save face crops at model input resolution


def compute_ita(face_bgr: np.ndarray) -> float:
    """
    ITA from forehead+cheek region of a face crop.
    Using forehead (top 30%) for less variation from beard/eyebrows.
    Lower ITA = darker skin tone.
    """
    h = face_bgr.shape[0]
    forehead = face_bgr[:int(h * 0.30), :]
    lab = cv2.cvtColor(forehead, cv2.COLOR_BGR2Lab)
    L = lab[:, :, 0].astype(np.float32)
    b = lab[:, :, 2].astype(np.float32)
    L_mean = np.mean(L)
    b_mean = np.mean(b)
    return float(np.degrees(np.arctan2(L_mean - 50.0, b_mean + 1e-6)))


def detect_and_crop(img_bgr: np.ndarray) -> np.ndarray | None:
    """
    Detect face with Haar cascade, add 15% margin, return 112x112 crop.
    Falls back to center-crop if no face detected (MS1MV3 images are already
    face-centered 250x250, so center-crop is a reliable fallback).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = _cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))

    if len(faces) > 0:
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        margin = int(0.15 * max(w, h))
        x1 = max(0, x - margin)
        y1 = max(0, y - margin)
        x2 = min(img_bgr.shape[1], x + w + margin)
        y2 = min(img_bgr.shape[0], y + h + margin)
        crop = img_bgr[y1:y2, x1:x2]
    else:
        # MS1MV3 images have face centred — center-crop 80% of image
        h, w = img_bgr.shape[:2]
        margin_x = int(w * 0.10)
        margin_y = int(h * 0.10)
        crop = img_bgr[margin_y:h - margin_y, margin_x:w - margin_x]

    if crop.size == 0:
        return None
    return cv2.resize(crop, (INPUT_SIZE, INPUT_SIZE))


def decode_image(img_bytes: bytes) -> np.ndarray | None:
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def main():
    parser = argparse.ArgumentParser(description="Extract Indian demographic faces from MS1MV3 parquet")
    parser.add_argument("--parquet", default="ml/train-00000-of-00001.parquet")
    parser.add_argument("--output_dir", default="data/filtered_indian")
    parser.add_argument("--ita_threshold", type=float, default=DEFAULT_ITA_THRESHOLD,
                        help="ITA cutoff — lower = darker only. Default 28° (Type IV–VI)")
    parser.add_argument("--min_imgs", type=int, default=DEFAULT_MIN_IMGS,
                        help="Min images per identity to include (default 2)")
    args = parser.parse_args()

    parquet_path = Path(args.parquet)
    output_path = Path(args.output_dir)

    if not parquet_path.exists():
        print(f"[FAIL] Parquet not found: {parquet_path}")
        return

    print(f"[1/4] Reading {parquet_path.name} ({parquet_path.stat().st_size / 1e6:.1f} MB)...")
    table = pq.read_table(parquet_path)
    records = [
        (row["label"], row["image"]["bytes"] if isinstance(row["image"], dict) else row["image"])
        for row in table.to_pylist()
        if row["image"] is not None
    ]
    print(f"      {len(records)} images, {len(set(r[0] for r in records))} identities")

    print(f"\n[2/4] Filtering by ITA < {args.ita_threshold}° (South Asian skin tone)...")
    by_identity: dict[int, list[np.ndarray]] = defaultdict(list)
    rejected_decode = 0
    rejected_no_face = 0
    rejected_ita = 0
    accepted = 0

    for label, img_bytes in tqdm(records, desc="  Filtering"):
        img = decode_image(img_bytes)
        if img is None:
            rejected_decode += 1
            continue

        face = detect_and_crop(img)
        if face is None:
            rejected_no_face += 1
            continue

        ita = compute_ita(face)
        if ita >= args.ita_threshold:
            rejected_ita += 1
            continue

        by_identity[label].append(face)
        accepted += 1

    print(f"\n  Accepted: {accepted} images across {len(by_identity)} identities")
    print(f"  Rejected — decode fail: {rejected_decode} | no face: {rejected_no_face} | "
          f"skin tone (ITA≥{args.ita_threshold}°): {rejected_ita}")

    # Filter identities by min_imgs
    print(f"\n[3/4] Keeping identities with >= {args.min_imgs} images...")
    qualified = {k: v for k, v in by_identity.items() if len(v) >= args.min_imgs}
    total_imgs = sum(len(v) for v in qualified.values())
    print(f"      {len(qualified)} identities, {total_imgs} images")
    if len(qualified) < 50:
        print(f"  [WARN] Only {len(qualified)} identities — consider lowering --min_imgs or adding more data")
        print("  For ArcFace fine-tuning, 100+ identities with 5+ images each is recommended.")
        print("  Add IMFDB dataset: see ml/README.md → Dataset section.")

    print(f"\n[4/4] Writing to {output_path}...")
    output_path.mkdir(parents=True, exist_ok=True)
    for identity_id, faces in tqdm(qualified.items(), desc="  Writing"):
        id_dir = output_path / str(identity_id)
        id_dir.mkdir(exist_ok=True)
        for i, face in enumerate(faces):
            cv2.imwrite(str(id_dir / f"{i:04d}.jpg"), face)

    print(f"\n=== Done ===")
    print(f"  Output: {output_path}")
    print(f"  Identities: {len(qualified)}")
    print(f"  Images: {total_imgs}")
    avg = total_imgs / len(qualified) if qualified else 0
    print(f"  Avg images/identity: {avg:.1f}")

    five_plus = sum(1 for v in qualified.values() if len(v) >= 5)
    print(f"  Identities with >=5 images: {five_plus}  ← usable for ArcFace fine-tuning")

    print(f"\nNext steps:")
    print(f"  1. Add IMFDB data to {output_path}/ (see ml/README.md)")
    print(f"  2. python ml/augmentation/augment.py \\")
    print(f"         --input_dir {output_path} \\")
    print(f"         --output_dir data/augmented_indian \\")
    print(f"         --augmentations_per_image 10")
    print(f"  3. python ml/scripts/finetune.py --data_dir data/augmented_indian")


if __name__ == "__main__":
    main()
