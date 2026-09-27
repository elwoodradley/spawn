"""The most common ML bug: a shape mismatch. Run it to see the error.

SPAWN turns the traceback into links; click a frame to jump to the line.
Hover a name in the editor while the Interactive Console is idle to see its shape before it goes wrong.
"""

try:
    import numpy as np
except ImportError:
    np = None


def batch_features(n: int):
    if np is None:
        return [[0.0] * 8 for _ in range(n)]
    return np.zeros((n, 8))


def weights():
    if np is None:
        return [[0.0] * 4 for _ in range(16)]  # 16 x 4, but features are 8 wide
    return np.zeros((16, 4))


def forward(x, w):
    if np is None:
        assert len(x[0]) == len(w), f"shape mismatch: features {len(x[0])} vs weights {len(w)}"
        return x
    return x @ w


print("batch of 32, 8 features, weights expect 16")
forward(batch_features(32), weights())
print("unreachable")
