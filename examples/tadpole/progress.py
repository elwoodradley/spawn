"""Writes progress with carriage returns, like tqdm does."""

import sys
import time

for i in range(1, 51):
    bar = "#" * (i // 2) + "-" * (25 - i // 2)
    sys.stderr.write(f"\r[{bar}] {i * 2}%")
    sys.stderr.flush()
    time.sleep(0.04)
sys.stderr.write("\n")
print("loss: 0.234")
print("finished")
