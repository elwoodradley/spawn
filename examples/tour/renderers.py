"""Shape-aware rendering in the Interactive Console. Run each cell with Shift+Enter.

SPAWN looks at the shape and type of a bare value and shows the right thing
without any plot code. Needs numpy in the interpreter; nothing else.
"""

# %% ── setup
import numpy as np

rng = np.random.default_rng(3)
print("numpy", np.__version__)

# %% ── a DataFrame-free table: a dict of dicts renders as a table
report = {
    "cat": {"precision": 0.91, "recall": 0.88, "f1-score": 0.895, "support": 120},
    "dog": {"precision": 0.84, "recall": 0.90, "f1-score": 0.869, "support": 100},
    "frog": {"precision": 0.97, "recall": 0.93, "f1-score": 0.95, "support": 80},
}
report

# %% ── confusion matrix: a square non-negative integer matrix
# Fake predictions for 300 samples over 3 classes. SPAWN also finds the
# y_true / y_pred pair in the namespace, so clicking a cell lists the samples
# that landed there.
y_true = rng.integers(0, 3, size=300)
y_pred = y_true.copy()
flip = rng.random(300) < 0.15
y_pred[flip] = rng.integers(0, 3, size=flip.sum())

cm = np.zeros((3, 3), dtype=int)
for t, p in zip(y_true, y_pred):
    cm[t, p] += 1
cm

# %% ── image grid: (N, C, H, W) renders as thumbnails
batch = rng.random((16, 3, 28, 28)).astype("float32")
batch[:, 0] *= np.linspace(0, 1, 28)[None, :, None]  # a red gradient
batch

# %% ── grayscale batch: (N, H, W)
digits = np.zeros((10, 20, 20), dtype="uint8")
for i in range(10):
    digits[i, 2 + i : 18 - i, 4:16] = 255
digits

# %% ── an ordinary array still gets the array card with a heatmap
weights = rng.normal(0, 0.3, (12, 40))
weights
