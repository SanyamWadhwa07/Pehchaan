"""
Pre-Sprint / Day 1: Indian demographic dataset preparation.
Run from repo root: python ml/scripts/prepare_dataset.py --input_dir <path>

IMPORTANT — MS-Celeb-1M is no longer officially distributed (Microsoft took it down
in 2019 due to privacy concerns). Use one of the alternatives below instead:

  Option A (Recommended): VGGFace2
    - Download: https://www.robots.ox.ac.uk/~vgg/data/vgg_face2/
    - ~3.3M images, 9,131 identities — diverse enough to filter for South Asian faces
    - Filter by skin tone + head pose using the pipeline below

  Option B: CASIA-WebFace
    - ~500K images, 10,575 identities
    - Download via academic request

  Option C: IJB-C (NIST)
    - Government dataset, good demographic diversity
    - Requires NIST agreement: https://www.nist.gov/programs-projects/face-challenges

  Option D: Synthetic augmentation only (fallback)
    - Use a small manually-collected set of Indian faces (own team, consented contacts)
    - Apply heavy augmentation via ml/augmentation/augment.py
    - Sufficient for FAR/FRR baseline on a hackathon demo

Place your raw dataset at: data/raw/  (gitignored)
Output filtered dataset:   data/filtered_indian/  (gitignored)

This script:
  1. Detects faces using BlazeFace / MediaPipe
  2. Estimates skin tone using ITA (Individual Typology Angle) — filters for darker tones
  3. Filters by head pose (yaw ±30°, pitch ±20°) — outdoor worker conditions
  4. Splits into train/val/test sets (80/10/10)
  5. Writes a manifest CSV with identity labels
"""

import argparse
import csv
import shutil
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

try:
    import mediapipe as mp
except ImportError:
    raise ImportError("Run: uv pip install mediapipe>=0.10.30")


# ITA < 28° → Type IV–VI skin (darker tones — target for Indian demographic filter)
# Reference: Del Bino et al., 2006
ITA_THRESHOLD = 28.0

# Head pose limits for outdoor conditions
YAW_LIMIT = 30.0
PITCH_LIMIT = 20.0

MIN_FACE_SIZE = 64  # px — discard very small detections


def compute_ita(face_bgr: np.ndarray) -> float:
    """Individual Typology Angle — lower = darker skin tone."""
    lab = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2Lab)
    L, a, b = cv2.split(lab)
    L_mean = np.mean(L)
    b_mean = np.mean(b)
    ita = np.degrees(np.arctan((L_mean - 50) / (b_mean + 1e-6)))
    return float(ita)


def estimate_yaw_pitch(face_landmarks, image_shape) -> tuple[float, float]:
    """Rough yaw + pitch from MediaPipe face mesh landmarks."""
    h, w = image_shape[:2]
    # Use nose tip, chin, left/right eye corners as reference points
    nose = face_landmarks.landmark[1]
    chin = face_landmarks.landmark[152]
    left_eye = face_landmarks.landmark[33]
    right_eye = face_landmarks.landmark[263]

    dx = (right_eye.x - left_eye.x) * w
    dy = (right_eye.y - left_eye.y) * h
    yaw = np.degrees(np.arctan2(dy, dx))

    dz_nose = nose.y - chin.y
    pitch = np.degrees(np.arctan2(dz_nose, 0.3))  # approx

    return float(yaw), float(pitch)


def prepare_dataset(input_dir: str, output_dir: str, split: tuple = (0.8, 0.1, 0.1)):
    input_path = Path(input_dir)
    output_path = Path(output_dir)

    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1)

    all_images = list(input_path.rglob("*.jpg")) + list(input_path.rglob("*.png"))
    print(f"Found {len(all_images)} images in {input_dir}")

    accepted = []
    rejected_ita = 0
    rejected_pose = 0
    rejected_no_face = 0

    for img_path in tqdm(all_images, desc="Filtering"):
        img = cv2.imread(str(img_path))
        if img is None:
            continue

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)

        if not result.multi_face_landmarks:
            rejected_no_face += 1
            continue

        landmarks = result.multi_face_landmarks[0]

        # Skin tone filter
        ita = compute_ita(img)
        if ita > ITA_THRESHOLD:
            rejected_ita += 1
            continue

        # Head pose filter
        yaw, pitch = estimate_yaw_pitch(landmarks, img.shape)
        if abs(yaw) > YAW_LIMIT or abs(pitch) > PITCH_LIMIT:
            rejected_pose += 1
            continue

        identity = img_path.parent.name
        accepted.append({"path": img_path, "identity": identity, "ita": ita, "yaw": yaw, "pitch": pitch})

    print(f"\nAccepted: {len(accepted)} | Rejected — no face: {rejected_no_face}, "
          f"skin tone: {rejected_ita}, pose: {rejected_pose}")

    if not accepted:
        print("No images passed filters. Check --input_dir or loosen thresholds.")
        return

    # Shuffle + split
    np.random.seed(42)
    np.random.shuffle(accepted)
    n = len(accepted)
    n_train = int(n * split[0])
    n_val = int(n * split[1])

    splits = {
        "train": accepted[:n_train],
        "val": accepted[n_train:n_train + n_val],
        "test": accepted[n_train + n_val:],
    }

    manifest_rows = []
    for split_name, items in splits.items():
        split_dir = output_path / split_name
        split_dir.mkdir(parents=True, exist_ok=True)
        for item in tqdm(items, desc=f"Copying {split_name}"):
            identity_dir = split_dir / item["identity"]
            identity_dir.mkdir(exist_ok=True)
            dest = identity_dir / item["path"].name
            shutil.copy2(item["path"], dest)
            manifest_rows.append({
                "split": split_name,
                "identity": item["identity"],
                "path": str(dest),
                "ita": round(item["ita"], 2),
                "yaw": round(item["yaw"], 2),
                "pitch": round(item["pitch"], 2),
            })

    manifest_path = output_path / "manifest.csv"
    with open(manifest_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["split", "identity", "path", "ita", "yaw", "pitch"])
        writer.writeheader()
        writer.writerows(manifest_rows)

    print(f"\nDataset written to {output_dir}")
    print(f"  train: {len(splits['train'])} | val: {len(splits['val'])} | test: {len(splits['test'])}")
    print(f"  manifest: {manifest_path}")
    print("\nNext: run ml/augmentation/augment.py on data/filtered_indian/train/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare Indian demographic face dataset")
    parser.add_argument("--input_dir", required=True, help="Raw dataset root (identity folders inside)")
    parser.add_argument("--output_dir", default="data/filtered_indian", help="Output directory")
    parser.add_argument("--ita_threshold", type=float, default=ITA_THRESHOLD,
                        help="ITA cutoff — lower = darker only. Default 28°")
    args = parser.parse_args()

    prepare_dataset(args.input_dir, args.output_dir)
