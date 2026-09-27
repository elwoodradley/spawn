"""A run that overfits, with the traps a real log has. Run it (F5).

The Metrics tab should show: `loss` and `val_loss` on one chart with the gap
shaded as val climbs after epoch 13; the epoch-1 val spike kept off-scale so
the U stays readable; and the one-off prints (`hidden=64`, `accuracy 0.923`)
listed as values, not charted.
"""

import math
import random
import sys
import time

random.seed(4)
HIDDEN = 64
EPOCHS = 40
print(f"hidden={HIDDEN}")

for epoch in range(1, EPOCHS + 1):
    loss = 1.2 * math.exp(-epoch / 9) + 0.02 + random.gauss(0, 0.01)
    if epoch == 1:
        val_loss = 6.78  # the classic first-epoch spike
    else:
        val_loss = 0.05 + 0.6 * math.exp(-epoch / 5) + 0.004 * max(0, epoch - 13) ** 1.6
        val_loss += random.gauss(0, 0.01)
    print(f"epoch {epoch}/{EPOCHS} loss: {loss:.4f} val_loss: {val_loss:.4f}")
    sys.stdout.flush()
    time.sleep(0.06)

print(f"accuracy {0.923:.3f}")
print("done")
