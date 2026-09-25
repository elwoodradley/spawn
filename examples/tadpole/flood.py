"""Floods stdout to test the output panel under load."""

for i in range(20000):
    print(f"line {i} " + "x" * 40)
