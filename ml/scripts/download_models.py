"""
Pre-Sprint: Download MobileFaceNet + BlazeFace weights into ml/models/
Run from repo root: python ml/scripts/download_models.py

What this downloads:
  1. BlazeFace short-range TFLite — from MediaPipe model zoo (official Google source)
  2. MobileFaceNet base weights (Keras .h5) — from sirius-ai/MobileFaceNet_TF release
     This is the PRE-fine-tuning base. Sanyam will fine-tune on Indian demographic data
     and then INT8-quantise for TFLite (Day 1 task).
"""

import os
import urllib.request
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


DOWNLOADS = [
    {
        "name": "BlazeFace short-range (TFLite float16)",
        "url": "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
        "dest": MODELS_DIR / "blazeface.tflite",
        "required": True,
    },
]

MBF_DEST = MODELS_DIR / "mobilefacenet_base.onnx"


def download(name: str, url: str, dest: Path) -> bool:
    if dest.exists():
        size_mb = dest.stat().st_size / 1_000_000
        print(f"  [skip] {name} already at {dest.name} ({size_mb:.1f} MB)")
        return True

    print(f"  Downloading {name}...")
    print(f"    {url}")
    try:
        def progress(count, block_size, total_size):
            pct = min(count * block_size / total_size * 100, 100)
            print(f"\r    {pct:.1f}%", end="", flush=True)

        urllib.request.urlretrieve(url, dest, reporthook=progress)
        print()
        size_mb = dest.stat().st_size / 1_000_000
        print(f"  [ok] {dest.name} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"\n  [FAIL] {name}: {e}")
        print(f"         Manual download URL: {url}")
        print(f"         Place file at: {dest}")
        return False


def download_mobilefacenet() -> bool:
    if MBF_DEST.exists():
        size_mb = MBF_DEST.stat().st_size / 1_000_000
        print(f"  [skip] MobileFaceNet already at {MBF_DEST.name} ({size_mb:.1f} MB)")
        return True

    print("  Downloading MobileFaceNet (w600k_mbf) via InsightFace buffalo_sc...")

    # Primary: insightface auto-download (~16MB total pack)
    try:
        import insightface
        app = insightface.app.FaceAnalysis(name='buffalo_sc')
        app.prepare(ctx_id=-1)
        src = Path.home() / ".insightface" / "models" / "buffalo_sc" / "w600k_mbf.onnx"
        if src.exists():
            import shutil
            shutil.copy(src, MBF_DEST)
            size_mb = MBF_DEST.stat().st_size / 1_000_000
            print(f"  [ok] mobilefacenet_base.onnx ({size_mb:.1f} MB) — via insightface")
            return True
    except Exception as e:
        print(f"  insightface auto-download failed: {e}. Trying direct ZIP...")

    # Fallback: GitHub releases ZIP
    try:
        zip_dest = MODELS_DIR / "buffalo_sc.zip"
        url = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
        print(f"    {url}")

        def progress(count, block_size, total_size):
            pct = min(count * block_size / total_size * 100, 100)
            print(f"\r    {pct:.1f}%", end="", flush=True)

        urllib.request.urlretrieve(url, zip_dest, reporthook=progress)
        print()

        import zipfile
        with zipfile.ZipFile(zip_dest, 'r') as z:
            z.extractall(MODELS_DIR)
        zip_dest.unlink()

        extracted = MODELS_DIR / "buffalo_sc" / "w600k_mbf.onnx"
        extracted.rename(MBF_DEST)
        size_mb = MBF_DEST.stat().st_size / 1_000_000
        print(f"  [ok] mobilefacenet_base.onnx ({size_mb:.1f} MB) — via ZIP")
        return True
    except Exception as e:
        print(f"  [FAIL] {e}")
        print("  Manual: download buffalo_sc.zip from InsightFace v0.7 release, extract w600k_mbf.onnx")
        print(f"  Place at: {MBF_DEST}")
        return False


def main():
    print("=== Pehchaan — Pre-Sprint Model Download ===\n")
    print(f"Target directory: {MODELS_DIR}\n")

    all_ok = True
    for item in DOWNLOADS:
        ok = download(item["name"], item["url"], item["dest"])
        if not ok and item["required"]:
            all_ok = False

    ok = download_mobilefacenet()
    if not ok:
        all_ok = False

    print()
    if all_ok:
        print("All models downloaded. Next step: run ml/scripts/quantise.py (Day 1)")
    else:
        print("Some downloads failed — see manual download URLs above.")
        print("Once placed manually, re-run this script to verify.")

    # Verify sizes
    print("\n--- Model verification ---")
    checks = [
        (MODELS_DIR / "blazeface.tflite", 4),
        (MODELS_DIR / "mobilefacenet_base.onnx", 20),
        (MODELS_DIR / "mobilefacenet_indian.tflite", 16),  # post-quantisation (Day 1)
    ]
    for path, max_mb in checks:
        if path.exists():
            size_mb = path.stat().st_size / 1_000_000
            status = "ok" if size_mb <= max_mb else f"EXCEEDS {max_mb}MB limit"
            print(f"  {path.name}: {size_mb:.1f} MB [{status}]")
        else:
            print(f"  {path.name}: not found")


if __name__ == "__main__":
    main()
