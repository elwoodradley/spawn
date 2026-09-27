"""Train a tiny MLP with PyTorch, if it is installed in this interpreter.

Watch the status bar: SPAWN shows the torch version and which device it will
use. The Metrics tab plots the loss as it prints. Without torch this explains how
to add it and exits cleanly.
"""

import sys
import time

try:
    import torch
except ImportError:
    print("torch is not installed in this interpreter.")
    print("From the project folder, in a terminal:  uv add torch")
    print("Then pick the project's .venv via Select Python Interpreter (status bar).")
    sys.exit(0)

device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print(f"torch {torch.__version__} on {device}")

torch.manual_seed(0)
x = torch.randn(2048, 16, device=device)
true_w = torch.randn(16, 1, device=device)
y = (x @ true_w + 0.1 * torch.randn(2048, 1, device=device)).sign()

model = torch.nn.Sequential(
    torch.nn.Linear(16, 64), torch.nn.ReLU(), torch.nn.Linear(64, 1)
).to(device)
opt = torch.optim.Adam(model.parameters(), lr=1e-2)
loss_fn = torch.nn.BCEWithLogitsLoss()

for step in range(1, 201):
    logits = model(x)
    loss = loss_fn(logits, (y > 0).float())
    opt.zero_grad()
    loss.backward()
    opt.step()
    if step % 5 == 0:
        acc = ((logits > 0) == (y > 0)).float().mean().item()
        print(f"step {step} loss: {loss.item():.4f} acc: {acc:.3f}")
        time.sleep(0.03)

print("done")
