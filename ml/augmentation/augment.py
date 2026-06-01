"""
Dataset augmentation pipeline for Indian demographic face model fine-tuning.
Owner: Sanyam Wadhwa — Day 1

Augmentations applied per image:
  - Random brightness / contrast (harsh sunlight, shadow, overcast simulation)
  - Hue shift (skin tone variation)
  - Gaussian noise (dust, sweat, outdoor haze)
  - Random occlusion patches (helmet straps, scarves, safety glasses)
  - Horizontal flip
  - Random crop + resize (slight scale variation)

Usage:
  python ml/augmentation/augment.py \
    --input_dir data/raw/indian_demographic \
    --output_dir data/augmented \
    --augmentations_per_image 5
"""

import argparse
from pathlib import Path

import cv2
import numpy as np
import albumentations as A


AUGMENTATION_PIPELINE = A.Compose([
    # Lighting conditions: direct sunlight, overcast, backlit, shadow
    A.RandomBrightnessContrast(brightness_limit=0.4, contrast_limit=0.4, p=0.8),
    A.RandomGamma(gamma_limit=(60, 140), p=0.5),

    # Skin tone variation via hue shift
    A.HueSaturationValue(hue_shift_limit=15, sat_shift_limit=30, val_shift_limit=20, p=0.6),

    # Outdoor haze, dust, sweat simulation
    # std_range is fraction of [0,1] — (0.04, 0.2) ≈ 10–50 noise std on 0–255 scale
    A.GaussNoise(std_range=(0.04, 0.2), p=0.5),
    A.Blur(blur_limit=3, p=0.3),

    # Occlusion patches (helmet straps, scarves, safety glasses frames)
    # Albumentations 2.x API: num_holes_range, hole_height_range, hole_width_range (pixels)
    A.CoarseDropout(num_holes_range=(1, 4), hole_height_range=(10, 30), hole_width_range=(20, 60), p=0.4),

    # Scale + flip — Albumentations 2.x: use Affine instead of ShiftScaleRotate
    A.HorizontalFlip(p=0.5),
    A.Affine(translate_percent=(-0.05, 0.05), scale=(0.9, 1.1), rotate=(-10, 10), p=0.5),
])


def augment_dataset(input_dir: str, output_dir: str, augmentations_per_image: int = 5) -> None:
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    image_paths = list(input_path.rglob("*.jpg")) + list(input_path.rglob("*.png"))
    print(f"Found {len(image_paths)} images. Generating {augmentations_per_image}x augmentations each.")

    for img_path in image_paths:
        image = cv2.imread(str(img_path))
        if image is None:
            print(f"  Skipping unreadable: {img_path}")
            continue

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        relative = img_path.relative_to(input_path)
        out_subdir = output_path / relative.parent
        out_subdir.mkdir(parents=True, exist_ok=True)

        for i in range(augmentations_per_image):
            augmented = AUGMENTATION_PIPELINE(image=image_rgb)["image"]
            out_file = out_subdir / f"{img_path.stem}_aug{i}{img_path.suffix}"
            cv2.imwrite(str(out_file), cv2.cvtColor(augmented, cv2.COLOR_RGB2BGR))

    print(f"Done. Augmented images written to {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Augment Indian demographic face dataset")
    parser.add_argument("--input_dir", required=True, help="Path to raw dataset")
    parser.add_argument("--output_dir", required=True, help="Path to write augmented images")
    parser.add_argument("--augmentations_per_image", type=int, default=5)
    args = parser.parse_args()

    augment_dataset(args.input_dir, args.output_dir, args.augmentations_per_image)
