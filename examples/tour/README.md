# tour

A small project to try SPAWN with. Open this folder, pick a file, press F5.

| File               | Shows                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `main.py`          | `input()` works inside SPAWN; answer in the stdin row.                                                         |
| `assignment.docx`  | A Word handout opens as a readable tab: click it in the tree.                                                  |
| `renderers.py`     | Shift+Enter cells: dict → table, confusion matrix, image grids.                                                |
| `train.py`         | Live loss and accuracy curves in the Metrics tab, pure Python.                                                 |
| `overfit.py`       | loss vs val_loss on one chart with the gap shaded; a spike kept off-scale; one-off prints listed, not charted. |
| `torch_train.py`   | Same with PyTorch, plus torch version and device in the bar.                                                   |
| `tensor_shapes.py` | A shape-mismatch error with clickable traceback frames.                                                        |
| `dataframe.py`     | A pandas DataFrame: text under F5, a real table in the Interactive Console.                                    |
| `progress.py`      | Carriage-return progress bars render in place.                                                                 |
| `error.py`         | A plain traceback.                                                                                             |
| `syntax_error.py`  | A SyntaxError report.                                                                                          |
| `flood.py`         | 20,000 lines fast; the panel stays responsive.                                                                 |

To use torch or pandas here, create an environment in this folder:

```
uv init --bare; and uv add torch pandas numpy
```

then choose the `.venv` interpreter with Select Python Interpreter in the status bar.
