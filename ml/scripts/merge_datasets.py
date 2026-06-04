"""
Merge two Kaggle Indian face datasets into a single identity-folder layout.

Sources:
  - kaggle_indian_actors/actors_dataset/Indian_actors_faces/  (135 identities, snake_case)
  - kaggle_indian2/train/ + kaggle_indian2/val/               (247 identities, mixed CamelCase/ALLCAPS)

Deduplication: folder names are normalized to lowercase+underscores before merge.
If two source folders map to the same normalized name, their images are merged into one output folder.

Usage (run from repo root):
  python ml/scripts/merge_datasets.py \
      --ds1 data/raw/kaggle_indian_actors/actors_dataset/Indian_actors_faces \
      --ds2 data/raw/kaggle_indian2 \
      --output data/merged_indian \
      --min_images 5
"""

import argparse
import re
import shutil
from collections import defaultdict
from pathlib import Path


IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def normalize(name: str) -> str:
    """CamelCase / ALLCAPS / snake_case → lowercase_with_underscores."""
    # Insert underscore before uppercase runs that follow lowercase
    name = re.sub(r"([a-z])([A-Z])", r"\1_\2", name)
    # Insert underscore before uppercase+lowercase run after all-caps run
    name = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return name.lower().strip("_")


def collect_identity_folders(root: Path) -> dict[str, list[Path]]:
    """Return {normalized_name: [folder, ...]} for all identity-level dirs under root."""
    mapping: dict[str, list[Path]] = defaultdict(list)
    for folder in sorted(root.iterdir()):
        if not folder.is_dir():
            continue
        norm = normalize(folder.name)
        mapping[norm].append(folder)
    return mapping


def merge_datasets(ds1: Path, ds2: Path, output: Path, min_images: int) -> None:
    output.mkdir(parents=True, exist_ok=True)

    # ds2 has train/ and val/ sub-splits — scan both
    ds2_roots = []
    if (ds2 / "train").is_dir():
        ds2_roots.append(ds2 / "train")
    if (ds2 / "val").is_dir():
        ds2_roots.append(ds2 / "val")
    if not ds2_roots:
        ds2_roots = [ds2]  # flat layout fallback

    # Collect all sources keyed by normalized identity name
    identity_sources: dict[str, list[Path]] = defaultdict(list)

    for folder, sources in collect_identity_folders(ds1).items():
        identity_sources[folder].extend(sources)

    for root in ds2_roots:
        for folder, sources in collect_identity_folders(root).items():
            identity_sources[folder].extend(sources)

    # Copy images into output/<normalized_identity>/
    total_identities = 0
    total_images = 0
    skipped_low = 0

    for norm_name, folders in sorted(identity_sources.items()):
        out_identity = output / norm_name
        img_counter = 0

        for src_folder in folders:
            for img_path in sorted(src_folder.iterdir()):
                if img_path.suffix.lower() not in IMG_EXTS:
                    continue
                out_identity.mkdir(parents=True, exist_ok=True)
                dest = out_identity / f"{img_counter:05d}{img_path.suffix.lower()}"
                shutil.copy2(img_path, dest)
                img_counter += 1

        if img_counter < min_images:
            # Remove the folder — not enough images for meaningful identity
            if out_identity.exists():
                shutil.rmtree(out_identity)
            skipped_low += 1
            continue

        total_identities += 1
        total_images += img_counter

    print(f"\nMerge complete -> {output}")
    print(f"  Identities: {total_identities}")
    print(f"  Images:     {total_images}")
    print(f"  Skipped (< {min_images} images): {skipped_low}")
    print(f"\nNext: python ml/scripts/align_dataset.py --input_dir {output} --output_dir data/aligned_indian")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Merge Kaggle Indian face datasets")
    parser.add_argument("--ds1", default="data/raw/kaggle_indian_actors/actors_dataset/Indian_actors_faces",
                        help="Dataset 1 root (identity folders directly inside)")
    parser.add_argument("--ds2", default="data/raw/kaggle_indian2",
                        help="Dataset 2 root (has train/ and val/ sub-dirs)")
    parser.add_argument("--output", default="data/merged_indian",
                        help="Output directory")
    parser.add_argument("--min_images", type=int, default=5,
                        help="Drop identities with fewer than this many images")
    args = parser.parse_args()

    merge_datasets(Path(args.ds1), Path(args.ds2), Path(args.output), args.min_images)
