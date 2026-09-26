"""A small training loop in pure Python, so it runs on any interpreter.

Spawn it and open the Run tab: SPAWN parses the `loss:` and `acc:` values it
prints into live curves, and the tqdm-style bar on stderr into a progress
bar with an iteration rate. No numpy or torch needed.
"""

import math
import random
import sys
import time

random.seed(7)

# Two blobs in 2D; learn a logistic regression that separates them.
N = 400
X = [(random.gauss(-1.2, 0.9), random.gauss(-0.8, 0.9)) for _ in range(N // 2)]
X += [(random.gauss(1.2, 0.9), random.gauss(0.9, 0.9)) for _ in range(N // 2)]
Y = [0.0] * (N // 2) + [1.0] * (N // 2)

w = [0.0, 0.0]
b = 0.0
LR = 0.15
EPOCHS = 60


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def clock(seconds: float) -> str:
    return f"{int(seconds) // 60:02d}:{int(seconds) % 60:02d}"


def bar(done: int, total: int, elapsed: float) -> str:
    """The exact tqdm layout, so the Run tab reads progress, rate and ETA."""
    frac = done / total
    filled = int(frac * 24)
    rate = done / elapsed if elapsed > 0 else 0.0
    eta = (total - done) / rate if rate > 0 else 0.0
    return (
        f"\r{int(frac * 100):3d}%|{'█' * filled}{' ' * (24 - filled)}| {done}/{total} "
        f"[{clock(elapsed)}<{clock(eta)}, {rate:.2f}it/s]"
    )


started = time.perf_counter()
for epoch in range(1, EPOCHS + 1):
    grad_w = [0.0, 0.0]
    grad_b = 0.0
    loss = 0.0
    correct = 0
    for (x1, x2), y in zip(X, Y):
        p = sigmoid(w[0] * x1 + w[1] * x2 + b)
        loss += -(y * math.log(p + 1e-9) + (1 - y) * math.log(1 - p + 1e-9))
        correct += int((p > 0.5) == (y > 0.5))
        d = p - y
        grad_w[0] += d * x1
        grad_w[1] += d * x2
        grad_b += d
    w[0] -= LR * grad_w[0] / N
    w[1] -= LR * grad_w[1] / N
    b -= LR * grad_b / N

    sys.stderr.write(bar(epoch, EPOCHS, time.perf_counter() - started))
    sys.stderr.flush()
    print(f"epoch {epoch}/{EPOCHS} loss: {loss / N:.4f} acc: {correct / N:.3f}")
    time.sleep(0.08)

sys.stderr.write("\n")
print(f"done. weights {w[0]:.3f}, {w[1]:.3f}; bias {b:.3f}")
