"""Build a small DataFrame and print it, if pandas is available.

Under F5 this prints the repr. Spawn it into the pool (Ctrl+Shift+F5) and
the bare `df` at the end opens a real scrollable table with dtypes, shape,
nulls and stats.
"""

import random
import sys

try:
    import pandas as pd
except ImportError:
    print("pandas is not installed in this interpreter.")
    print("From the brood folder, in a terminal:  uv add pandas")
    sys.exit(0)

random.seed(1)
rows = [
    {
        "epoch": i,
        "loss": round(1.0 / (i + 1) + random.random() * 0.05, 4),
        "acc": round(min(0.99, 0.5 + i * 0.03), 3),
        "lr": 1e-3 if i < 10 else 1e-4,
        "note": None if i % 4 else "checkpoint",
    }
    for i in range(1, 21)
]
df = pd.DataFrame(rows)
print(df.shape)
print(df.dtypes)
print(df.describe())
print(df.tail())

df  # bare value: the pool renders it as a table
