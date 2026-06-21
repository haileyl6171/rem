# ============================================================================
#  Pure-PyTorch drop-in for the compiled `fused_ssim` package.   [P4]
#
#  gsplat's simple_trainer.py does `from fused_ssim import fused_ssim`, and that
#  package is a CUDA extension that compiles from source (the tar pit we hit on
#  the conda + pip-torch box). This shim computes the SAME SSIM with plain torch
#  ops — no compilation. setup_env.sh copies it to
#  vendor/gsplat/examples/fused_ssim.py so the import resolves to this instead.
#
#  Verified: garden trains to a clean splat with this shim, so it's equivalent
#  for our purposes (the SSIM term is identical math; only the speed differs).
# ============================================================================

import torch
import torch.nn.functional as F


def _gauss(ws: int, sigma: float) -> torch.Tensor:
    x = torch.arange(ws, dtype=torch.float32) - ws // 2
    g = torch.exp(-(x ** 2) / (2 * sigma ** 2))
    return g / g.sum()


def fused_ssim(img1, img2, padding="same", train=True, **kw):
    """img1, img2: (B, C, H, W) in [0,1]. Returns mean SSIM (differentiable)."""
    C = img1.shape[1]
    ws, sigma = 11, 1.5
    k = _gauss(ws, sigma).to(img1)
    win = (k[:, None] @ k[None, :])[None, None].expand(C, 1, ws, ws).contiguous()
    p = 0 if padding == "valid" else ws // 2
    mu1 = F.conv2d(img1, win, padding=p, groups=C)
    mu2 = F.conv2d(img2, win, padding=p, groups=C)
    m1, m2, m12 = mu1 * mu1, mu2 * mu2, mu1 * mu2
    s1 = F.conv2d(img1 * img1, win, padding=p, groups=C) - m1
    s2 = F.conv2d(img2 * img2, win, padding=p, groups=C) - m2
    s12 = F.conv2d(img1 * img2, win, padding=p, groups=C) - m12
    C1, C2 = 0.01 ** 2, 0.03 ** 2
    ssim = ((2 * m12 + C1) * (2 * s12 + C2)) / ((m1 + m2 + C1) * (s1 + s2 + C2))
    return ssim.mean()
