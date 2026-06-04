"""
Fine-tune MobileFaceNet with ArcFace loss on the Indian demographic dataset.

Expects data layout:
  data/augmented_indian/
    train/<identity>/<image>.jpg
    val/<identity>/<image>.jpg      (no augmentation — real images only)

Usage (run from repo root):
  python ml/scripts/finetune.py \
      --data_dir data/augmented_indian \
      --base_model ml/models/mobilefacenet_base.onnx \
      --output_dir ml/models/finetuned \
      [--epochs 30] [--batch_size 64] [--lr 1e-4] [--unfreeze_all]

Outputs:
  ml/models/finetuned/mobilefacenet_indian_ft.onnx   (best val TAR@0.92)
  ml/models/finetuned/training_log.csv
"""

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.optim import AdamW
    from torch.optim.lr_scheduler import CosineAnnealingLR
    from torch.utils.data import DataLoader
    from torchvision import datasets, transforms
except ImportError:
    sys.exit("Run: pip install torch torchvision")

try:
    import onnx  # noqa: F401 — used transitively by onnx2torch
except ImportError:
    sys.exit("Run: pip install onnx onnxruntime")


# ---------------------------------------------------------------------------
# ArcFace loss
# ---------------------------------------------------------------------------

class ArcFaceLoss(nn.Module):
    """Angular margin softmax loss (ArcFace, Deng et al. 2018)."""

    def __init__(self, embedding_dim: int, num_classes: int, m: float = 0.5, s: float = 64.0):
        super().__init__()
        self.s = s
        self.m = m
        self.weight = nn.Parameter(torch.empty(num_classes, embedding_dim))
        nn.init.xavier_uniform_(self.weight)
        self.cos_m = np.cos(m)
        self.sin_m = np.sin(m)
        self.th = np.cos(np.pi - m)   # threshold for numerical stability
        self.mm = np.sin(np.pi - m) * m

    def forward(self, embeddings: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        # Normalize embeddings and weights
        emb = F.normalize(embeddings, dim=1)
        W = F.normalize(self.weight, dim=1)
        cosine = F.linear(emb, W)  # (B, C)

        sine = torch.sqrt(1.0 - cosine.pow(2).clamp(0, 1))
        phi = cosine * self.cos_m - sine * self.sin_m  # cos(theta + m)
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)

        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.view(-1, 1), 1.0)

        logits = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        logits = logits * self.s

        return F.cross_entropy(logits, labels)


# ---------------------------------------------------------------------------
# MobileFaceNet loaded from ONNX, wrapped as a PyTorch model for fine-tuning
# ---------------------------------------------------------------------------

def load_mobilefacenet_from_onnx(onnx_path: Path):
    """
    Load MobileFaceNet from ONNX via onnx2torch.
    Returns (model, pretrained: bool).
    Load into memory first and pass the ModelProto — onnx2torch.convert() accepts
    either a path or an in-memory model. The in-memory path runs shape inference
    without writing any temp files, bypassing Windows Defender blocking unnamed
    temp files created by onnx's C++ binding.
    """
    try:
        import onnx
        import onnx2torch
        onnx_model = onnx.load(str(onnx_path))
        onnx_model = onnx.shape_inference.infer_shapes(onnx_model)
        model = onnx2torch.convert(onnx_model)
        print(f"Loaded base model from {onnx_path} via onnx2torch")
        return model, True
    except Exception as e:
        print(f"onnx2torch failed ({e}) — using random-init MobileFaceNet (all layers will train)")
        return MobileFaceNet(), False


class LinearBlock(nn.Module):
    def __init__(self, in_c: int, out_c: int, kernel: int, stride: int, padding: int):
        super().__init__()
        self.conv = nn.Conv2d(in_c, out_c, kernel, stride, padding, bias=False)
        self.bn = nn.BatchNorm2d(out_c)

    def forward(self, x):
        return self.bn(self.conv(x))


class DepthWise(nn.Module):
    def __init__(self, in_c: int, out_c: int, residual: bool, kernel: int, stride: int, padding: int, expand: int):
        super().__init__()
        self.residual = residual
        self.conv = nn.Sequential(
            LinearBlock(in_c, in_c * expand, 1, 1, 0),
            nn.PReLU(in_c * expand),
            nn.Conv2d(in_c * expand, in_c * expand, kernel, stride, padding, groups=in_c * expand, bias=False),
            nn.BatchNorm2d(in_c * expand),
            nn.PReLU(in_c * expand),
            LinearBlock(in_c * expand, out_c, 1, 1, 0),
        )

    def forward(self, x):
        out = self.conv(x)
        return out + x if self.residual else out


class Residual(nn.Module):
    def __init__(self, c: int, num_block: int, groups: int, kernel: int, stride: int, padding: int):
        super().__init__()
        self.model = nn.Sequential(*[
            DepthWise(c, c, True, kernel, stride if i == 0 else 1, padding, groups)
            for i in range(num_block)
        ])

    def forward(self, x):
        return self.model(x)


class MobileFaceNet(nn.Module):
    """MobileFaceNet ~1M params, 112x112 input, 512-d embedding."""

    def __init__(self, embedding_dim: int = 512):
        super().__init__()
        self.conv1 = LinearBlock(3, 64, 3, 2, 1)
        self.conv2_dw = LinearBlock(64, 64, 3, 1, 1)
        self.conv_23 = DepthWise(64, 64, False, 3, 2, 1, 2)
        self.conv_3 = Residual(64, 4, 2, 3, 1, 1)
        self.conv_34 = DepthWise(64, 128, False, 3, 2, 1, 4)
        self.conv_4 = Residual(128, 6, 4, 3, 1, 1)
        self.conv_45 = DepthWise(128, 128, False, 3, 2, 1, 2)
        self.conv_5 = Residual(128, 2, 2, 3, 1, 1)
        self.conv_6_sep = LinearBlock(128, 512, 1, 1, 0)
        self.conv_6_dw = LinearBlock(512, 512, 7, 1, 0)
        self.conv_6_flatten = nn.Flatten()
        self.linear = nn.Linear(512, embedding_dim, bias=False)
        self.bn = nn.BatchNorm1d(embedding_dim)

    def forward(self, x):
        x = F.prelu(self.conv1(x), torch.ones(1, device=x.device) * 0.25)
        x = F.prelu(self.conv2_dw(x), torch.ones(1, device=x.device) * 0.25)
        x = self.conv_23(x)
        x = self.conv_3(x)
        x = self.conv_34(x)
        x = self.conv_4(x)
        x = self.conv_45(x)
        x = self.conv_5(x)
        x = self.conv_6_sep(x)
        x = self.conv_6_dw(x)
        x = self.conv_6_flatten(x)
        x = self.linear(x)
        x = self.bn(x)
        return x

    def freeze_base(self):
        """Freeze early layers (conv1 through conv_4), train only top layers."""
        for name, param in self.named_parameters():
            if any(name.startswith(p) for p in ["conv1", "conv2_dw", "conv_23", "conv_3", "conv_34", "conv_4"]):
                param.requires_grad = False

    def unfreeze_all(self):
        for param in self.parameters():
            param.requires_grad = True


# ---------------------------------------------------------------------------
# Validation: compute TAR and FAR at threshold 0.92
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate(model: nn.Module, val_loader: DataLoader, device: torch.device, threshold: float = 0.92):
    model.eval()
    embeddings_by_class: dict[int, list[torch.Tensor]] = {}

    for imgs, labels in val_loader:
        imgs = imgs.to(device)
        embs = F.normalize(model(imgs), dim=1)
        for emb, lbl in zip(embs.cpu(), labels):
            embeddings_by_class.setdefault(lbl.item(), []).append(emb)

    # Build same-pair and diff-pair cosine scores
    same_scores, diff_scores = [], []
    classes = list(embeddings_by_class.keys())

    for cls in classes:
        embs = embeddings_by_class[cls]
        for i in range(len(embs)):
            for j in range(i + 1, min(len(embs), i + 4)):  # limit pairs per identity
                same_scores.append(float(torch.dot(embs[i], embs[j])))

    for i in range(min(len(classes), 200)):
        for j in range(i + 1, min(i + 4, len(classes))):
            e1 = embeddings_by_class[classes[i]][0]
            e2 = embeddings_by_class[classes[j]][0]
            diff_scores.append(float(torch.dot(e1, e2)))

    if not same_scores or not diff_scores:
        return {"same_mean": 0.0, "diff_mean": 0.0, "TAR": 0.0, "FAR": 0.0}

    same_arr = np.array(same_scores)
    diff_arr = np.array(diff_scores)

    tar = float(np.mean(same_arr >= threshold))
    far = float(np.mean(diff_arr >= threshold))

    return {
        "same_mean": float(same_arr.mean()),
        "diff_mean": float(diff_arr.mean()),
        "TAR": tar,
        "FAR": far,
    }


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    transform_train = transforms.Compose([
        transforms.Resize((112, 112)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ])
    transform_val = transforms.Compose([
        transforms.Resize((112, 112)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ])

    data_dir = Path(args.data_dir)
    train_ds = datasets.ImageFolder(data_dir / "train", transform=transform_train)
    val_ds = datasets.ImageFolder(data_dir / "val", transform=transform_val)

    num_classes = len(train_ds.classes)
    print(f"Training: {len(train_ds)} images, {num_classes} identities")
    print(f"Val:      {len(val_ds)} images")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=0, pin_memory=False)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False, num_workers=0)

    # Build model
    base_path = Path(args.base_model)
    if base_path.exists():
        backbone, pretrained = load_mobilefacenet_from_onnx(base_path)
    else:
        print(f"Base model not found at {base_path}, using random-init MobileFaceNet (all layers will train)")
        backbone, pretrained = MobileFaceNet(), False

    if args.unfreeze_all or not pretrained:
        if not pretrained:
            print("Random init — training all layers (freezing skipped)")
        backbone.unfreeze_all() if hasattr(backbone, "unfreeze_all") else None
    else:
        if hasattr(backbone, "freeze_base"):
            backbone.freeze_base()
            print("Frozen: conv1, conv2_dw, conv_23, conv_3, conv_34, conv_4")

    backbone = backbone.to(device)
    arc_loss = ArcFaceLoss(512, num_classes, m=args.arc_m, s=args.arc_s).to(device)

    trainable = list(filter(lambda p: p.requires_grad, backbone.parameters()))
    optimizer = AdamW(trainable + list(arc_loss.parameters()),
                      lr=args.lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    log_path = output_dir / "training_log.csv"
    log_fields = ["epoch", "train_loss", "same_mean", "diff_mean", "TAR_092", "FAR_092"]

    best_tar = -1.0
    no_improve = 0

    with open(log_path, "w", newline="") as log_file:
        writer = csv.DictWriter(log_file, fieldnames=log_fields)
        writer.writeheader()

        for epoch in range(1, args.epochs + 1):
            backbone.train()
            arc_loss.train()
            total_loss = 0.0
            n_batches = 0
            total_batches = len(train_loader)

            for imgs, labels in train_loader:
                imgs, labels = imgs.to(device), labels.to(device)
                optimizer.zero_grad()
                embs = backbone(imgs)
                loss = arc_loss(embs, labels)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
                n_batches += 1
                if n_batches % 50 == 0 or n_batches == 1:
                    print(f"  Epoch {epoch} batch {n_batches}/{total_batches} loss={loss.item():.4f}", flush=True)

            scheduler.step()
            avg_loss = total_loss / max(n_batches, 1)

            # Validate every 5 epochs
            if epoch % 5 == 0 or epoch == args.epochs:
                metrics = evaluate(backbone, val_loader, device)
                tar = metrics["TAR"]
                print(f"Epoch {epoch:3d} | loss={avg_loss:.4f} | same={metrics['same_mean']:.4f} "
                      f"diff={metrics['diff_mean']:.4f} | TAR@0.92={tar:.3f} FAR@0.92={metrics['FAR']:.3f}")

                writer.writerow({
                    "epoch": epoch, "train_loss": round(avg_loss, 4),
                    "same_mean": round(metrics["same_mean"], 4),
                    "diff_mean": round(metrics["diff_mean"], 4),
                    "TAR_092": round(tar, 4),
                    "FAR_092": round(metrics["FAR"], 4),
                })
                log_file.flush()

                if tar > best_tar:
                    best_tar = tar
                    no_improve = 0
                    _export_onnx(backbone, output_dir / "mobilefacenet_indian_ft.onnx", device)
                    print(f"  -> Saved best model (TAR={best_tar:.3f})")
                else:
                    no_improve += 5
                    if no_improve >= args.early_stop_patience:
                        print(f"Early stop: no improvement for {args.early_stop_patience} epochs")
                        break
            else:
                print(f"Epoch {epoch:3d} | loss={avg_loss:.4f}")

    print(f"\nDone. Best TAR@0.92 = {best_tar:.3f}")
    print(f"Model: {output_dir}/mobilefacenet_indian_ft.onnx")
    print(f"Log:   {log_path}")
    print("\nNext: python ml/scripts/quantise.py --model ml/models/finetuned/mobilefacenet_indian_ft.onnx "
          "--calib_dir data/augmented_indian/train --output ml/models/mobilefacenet_indian.tflite")


def _export_onnx(model: nn.Module, out_path: Path, device: torch.device):
    model.eval()
    dummy = torch.randn(1, 3, 112, 112, device=device)
    torch.onnx.export(
        model, dummy, str(out_path),
        input_names=["input"], output_names=["embedding"],
        dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=12,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune MobileFaceNet with ArcFace on Indian dataset")
    parser.add_argument("--data_dir", default="data/augmented_indian",
                        help="Root with train/ and val/ sub-dirs")
    parser.add_argument("--base_model", default="ml/models/mobilefacenet_base.onnx",
                        help="Base ONNX model to start from")
    parser.add_argument("--output_dir", default="ml/models/finetuned")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch_size", type=int, default=64,
                        help="Reduce to 32 if OOM")
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--arc_m", type=float, default=0.5, help="ArcFace margin")
    parser.add_argument("--arc_s", type=float, default=64.0, help="ArcFace scale")
    parser.add_argument("--unfreeze_all", action="store_true",
                        help="Train all layers (default: freeze early blocks)")
    parser.add_argument("--early_stop_patience", type=int, default=10,
                        help="Stop if TAR@0.92 doesn't improve for this many epochs")
    args = parser.parse_args()

    train(args)
