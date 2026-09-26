"""SPAWN pool: the persistent kernel.

Stdlib only, so it runs in any interpreter SPAWN is pointed at. Launched by
SPAWN with SPAWN_POOL_PORT and SPAWN_POOL_TOKEN in the environment; connects
to 127.0.0.1:port, sends the token, then exchanges JSON lines:

  request  {"id": 1, "op": "exec", "code": "...", "file": "...", "startLine": 12, "scope": "cell"}
  event    {"id": 1, "event": "display", "payload": {...}}
  event    {"id": 1, "event": "done", "ok": true, "durationMs": 12}
  request  {"id": 2, "op": "inspect", "expression": "df"}
  event    {"id": 2, "event": "result", "data": {...} | null}

Other ops: variables, table_rows, configure, shutdown.

The program's stdout and stderr are the real pipes SPAWN already reads;
only protocol messages travel over the socket. Code runs on the main thread
so a SIGINT (or CTRL_BREAK on Windows) becomes KeyboardInterrupt inside it.
"""

from __future__ import annotations

import ast
import base64
import io
import json
import math
import os
import queue
import signal
import socket
import sys
import threading
import time
import traceback
import types

MAX_TEXT = 10_000
MAX_PREVIEW = 32
MAX_TABLE_ROWS = 200
MAX_VARIABLES = 500
STATS_SAMPLE = 1_000_000

# ── transport ───────────────────────────────────────────────────────────────


class Link:
    def __init__(self, sock: socket.socket) -> None:
        self.sock = sock
        self.lock = threading.Lock()
        self.reader = sock.makefile("r", encoding="utf-8")

    def send(self, message: dict) -> None:
        data = (json.dumps(message, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
        with self.lock:
            self.sock.sendall(data)

    def lines(self):
        for line in self.reader:
            line = line.strip()
            if line:
                yield line


def connect() -> Link:
    port = int(os.environ["SPAWN_POOL_PORT"])
    token = os.environ["SPAWN_POOL_TOKEN"]
    sock = socket.create_connection(("127.0.0.1", port), timeout=10)
    sock.settimeout(None)
    sock.sendall((token + "\n").encode("utf-8"))
    return Link(sock)


# ── json safety ─────────────────────────────────────────────────────────────


def jsonable(value):
    """Turn a cell value into something json.dumps accepts."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value if abs(value) < 2**53 else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, bytes):
        return repr(value)
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return jsonable(item())
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    text = repr(value)
    return text if len(text) <= 200 else text[:197] + "..."


def finite(x) -> float | None:
    try:
        f = float(x)
    except Exception:
        return None
    return f if math.isfinite(f) else None


# ── displays ────────────────────────────────────────────────────────────────


class Displays:
    """Turns values into protocol payloads. Keeps table refs for paging."""

    def __init__(self) -> None:
        self.tables: dict[str, object] = {}
        self.table_order: list[str] = []
        self.next_ref = 0
        self.plot_theme: dict | None = None
        self.mpl_configured = False

    # matplotlib -------------------------------------------------------------

    def matplotlib(self):
        return sys.modules.get("matplotlib.pyplot")

    def configure_matplotlib(self) -> None:
        mpl = sys.modules.get("matplotlib")
        if mpl is None or self.plot_theme is None:
            return
        t = self.plot_theme
        try:
            from cycler import cycler  # ships with matplotlib

            rc = mpl.rcParams
            rc["figure.facecolor"] = t["background"]
            rc["axes.facecolor"] = t["background"]
            rc["savefig.facecolor"] = t["background"]
            rc["axes.edgecolor"] = t["grid"]
            rc["axes.labelcolor"] = t["foreground"]
            rc["xtick.color"] = t["foreground"]
            rc["ytick.color"] = t["foreground"]
            rc["text.color"] = t["foreground"]
            rc["grid.color"] = t["grid"]
            rc["legend.facecolor"] = t["background"]
            rc["legend.edgecolor"] = t["grid"]
            rc["axes.prop_cycle"] = cycler(color=list(t["series"]))
            rc["figure.dpi"] = 110
            self.mpl_configured = True
        except Exception:
            pass

    def install_show_hook(self) -> None:
        plt = self.matplotlib()
        if plt is None or getattr(plt, "_spawn_hooked", False):
            return

        def show(*_args, **_kwargs):
            self.harvest_figures()

        plt.show = show
        plt._spawn_hooked = True

    def harvest_figures(self) -> list[dict]:
        plt = self.matplotlib()
        if plt is None:
            return []
        out = []
        for num in list(plt.get_fignums()):
            fig = plt.figure(num)
            try:
                out.append(self.figure(fig))
            except Exception as err:
                out.append(text_payload(f"<could not render figure {num}: {err}>"))
            finally:
                plt.close(fig)
        for payload in out:
            EMIT(payload)
        return out

    def figure(self, fig) -> dict:
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", dpi=fig.dpi)
        w, h = fig.get_size_inches()
        title = None
        try:
            axes = fig.get_axes()
            if axes and axes[0].get_title():
                title = axes[0].get_title()
        except Exception:
            pass
        return {
            "kind": "figure",
            "format": "png",
            "data": base64.b64encode(buf.getvalue()).decode("ascii"),
            "width": int(w * fig.dpi),
            "height": int(h * fig.dpi),
            "title": title,
        }

    # dispatch ----------------------------------------------------------------

    def of(self, value) -> dict | None:
        if value is None:
            return None
        mod = type(value).__module__ or ""
        try:
            if mod.startswith("matplotlib") and hasattr(value, "savefig"):
                payload = self.figure(value)
                plt = self.matplotlib()
                if plt is not None:
                    plt.close(value)
                return payload
            if mod.startswith("pandas"):
                if hasattr(value, "columns") and hasattr(value, "dtypes"):
                    return self.table_pandas(value)
                if hasattr(value, "to_frame"):
                    return self.table_pandas(value.to_frame())
            if mod.startswith("polars") and hasattr(value, "columns") and hasattr(value, "schema"):
                return self.table_polars(value)
            if mod.startswith("numpy") and hasattr(value, "shape") and hasattr(value, "dtype"):
                if getattr(value, "ndim", 0) == 0:
                    return text_payload(repr(value))
                return self.array(value, "numpy")
            if mod.startswith("torch") and hasattr(value, "shape") and hasattr(value, "dtype"):
                return self.array(value, "torch")
            if mod.startswith("jax") and hasattr(value, "shape") and hasattr(value, "dtype"):
                return self.array(value, "jax")
            html = getattr(value, "_repr_html_", None)
            if callable(html):
                markup = html()
                if isinstance(markup, str) and markup:
                    return {"kind": "html", "html": markup}
            png = getattr(value, "_repr_png_", None)
            if callable(png):
                data = png()
                if isinstance(data, bytes) and data:
                    return {
                        "kind": "figure",
                        "format": "png",
                        "data": base64.b64encode(data).decode("ascii"),
                        "width": 0,
                        "height": 0,
                        "title": None,
                    }
            svg = getattr(value, "_repr_svg_", None)
            if callable(svg):
                markup = svg()
                if isinstance(markup, str) and markup:
                    return {"kind": "figure", "format": "svg", "data": markup, "width": 0, "height": 0, "title": None}
        except Exception as err:
            return text_payload(f"{safe_repr(value)}\n<display failed: {err}>")
        return text_payload(safe_repr(value))

    # tables ------------------------------------------------------------------

    def remember(self, table) -> str:
        self.next_ref += 1
        ref = f"t{self.next_ref}"
        self.tables[ref] = table
        self.table_order.append(ref)
        while len(self.table_order) > 20:
            self.tables.pop(self.table_order.pop(0), None)
        return ref

    def table_pandas(self, df) -> dict:
        ref = self.remember(df)
        columns = []
        for name in df.columns:
            col = df[name]
            stats = None
            try:
                if str(col.dtype).startswith(("int", "uint", "float")):
                    stats = {
                        "min": finite(col.min()),
                        "max": finite(col.max()),
                        "mean": finite(col.mean()),
                        "std": finite(col.std()),
                    }
            except Exception:
                stats = None
            columns.append(
                {
                    "name": str(name),
                    "dtype": str(col.dtype),
                    "nulls": int(col.isna().sum()),
                    "stats": stats,
                }
            )
        rows, index = self.pandas_rows(df, 0, MAX_TABLE_ROWS)
        return {
            "kind": "table",
            "ref": ref,
            "source": "pandas",
            "shape": [int(df.shape[0]), int(df.shape[1])],
            "columns": columns,
            "index": index,
            "rows": rows,
            "rowStart": 0,
        }

    def pandas_rows(self, df, start: int, count: int):
        page = df.iloc[start : start + count]
        rows = [[jsonable(v) for v in row] for row in page.itertuples(index=False, name=None)]
        index = [jsonable(v) for v in page.index]
        return rows, index

    def table_polars(self, df) -> dict:
        ref = self.remember(df)
        columns = []
        for name, dtype in df.schema.items():
            col = df[name]
            stats = None
            try:
                if dtype.is_numeric():
                    stats = {
                        "min": finite(col.min()),
                        "max": finite(col.max()),
                        "mean": finite(col.mean()),
                        "std": finite(col.std()),
                    }
            except Exception:
                stats = None
            columns.append(
                {"name": str(name), "dtype": str(dtype), "nulls": int(col.null_count()), "stats": stats}
            )
        rows = self.polars_rows(df, 0, MAX_TABLE_ROWS)
        return {
            "kind": "table",
            "ref": ref,
            "source": "polars",
            "shape": [int(df.height), int(df.width)],
            "columns": columns,
            "index": list(range(min(df.height, MAX_TABLE_ROWS))),
            "rows": rows,
            "rowStart": 0,
        }

    def polars_rows(self, df, start: int, count: int):
        return [[jsonable(v) for v in row] for row in df.slice(start, count).rows()]

    def table_rows(self, ref: str, start: int, count: int):
        table = self.tables.get(ref)
        if table is None:
            return []
        count = max(1, min(count, 1000))
        if (type(table).__module__ or "").startswith("polars"):
            return self.polars_rows(table, start, count)
        rows, _ = self.pandas_rows(table, start, count)
        return rows

    # arrays ------------------------------------------------------------------

    def array(self, value, library: str) -> dict:
        shape = [int(s) for s in value.shape]
        dtype = str(value.dtype).replace("torch.", "")
        device = None
        requires_grad = None
        if library == "torch":
            device = str(value.device)
            requires_grad = bool(getattr(value, "requires_grad", False))
            value = value.detach()
            if value.is_sparse:
                value = value.to_dense()
            value = value.cpu()
            arr = value.numpy() if hasattr(value, "numpy") else None
            if arr is None or str(arr.dtype).startswith(("bfloat", "complex")):
                arr = value.float().numpy()
        elif library == "jax":
            import numpy as np  # jax depends on numpy

            arr = np.asarray(value)
            try:
                device = str(list(value.devices())[0])
            except Exception:
                device = None
        else:
            arr = value

        return {
            "kind": "array",
            "library": library,
            "shape": shape,
            "dtype": dtype,
            "device": device,
            "requiresGrad": requires_grad,
            "stats": self.array_stats(arr),
            "preview": self.array_preview(arr)[0],
            "previewAxes": self.array_preview(arr)[1],
        }

    def array_stats(self, arr) -> dict | None:
        import numpy as np

        try:
            if arr.size == 0 or not np.issubdtype(arr.dtype, np.number) and arr.dtype != bool:
                return None
            flat = arr.reshape(-1)
            if flat.size > STATS_SAMPLE:
                step = flat.size // STATS_SAMPLE
                flat = flat[::step]
            f = flat.astype("float64", copy=False)
            nans = int(np.isnan(f).sum())
            if nans == flat.size:
                return {"min": None, "max": None, "mean": None, "std": None, "nans": nans}
            return {
                "min": finite(np.nanmin(f)),
                "max": finite(np.nanmax(f)),
                "mean": finite(np.nanmean(f)),
                "std": finite(np.nanstd(f)),
                "nans": nans,
            }
        except Exception:
            return None

    def array_preview(self, arr):
        """A 2D window of at most 32x32 over the first two axes longer than 1."""
        import numpy as np

        try:
            if arr.ndim == 0:
                return [[jsonable(arr.item())]], None
            axes = [i for i, n in enumerate(arr.shape) if n > 1]
            if arr.ndim == 1:
                view = arr.reshape(1, -1)
                picked = [0, 0]
            elif len(axes) >= 2:
                a, b = axes[0], axes[1]
                index = [0] * arr.ndim
                index[a] = slice(None)
                index[b] = slice(None)
                view = arr[tuple(index)]
                picked = [a, b]
            else:
                view = arr.reshape(1, -1)
                picked = [axes[0] if axes else 0, axes[0] if axes else 0]
            r = max(1, math.ceil(view.shape[0] / MAX_PREVIEW))
            c = max(1, math.ceil(view.shape[1] / MAX_PREVIEW))
            view = view[::r, ::c]
            if not np.issubdtype(view.dtype, np.number) and view.dtype != bool:
                return [[jsonable(v) for v in row] for row in view.tolist()], picked
            f = view.astype("float64", copy=False)
            return [[finite(v) for v in row] for row in f.tolist()], picked
        except Exception:
            return [], None


def text_payload(text: str) -> dict:
    if len(text) > MAX_TEXT:
        text = text[:MAX_TEXT] + f"\n… [{len(text) - MAX_TEXT} more characters]"
    return {"kind": "text", "text": text}


def safe_repr(value) -> str:
    try:
        return repr(value)
    except Exception as err:
        return f"<{type(value).__name__}: repr failed: {err}>"


# ── the namespace and execution ─────────────────────────────────────────────


class Pool:
    def __init__(self, link: Link) -> None:
        self.link = link
        self.displays = Displays()
        self.namespace: dict = {"__name__": "__main__", "__builtins__": self.builtins()}
        self.current_id: int | None = None
        self.changed: set[str] = set()
        self.main_thread = threading.get_ident()

    def builtins(self) -> dict:
        """A builtins copy whose __import__ notices matplotlib arriving."""
        real = __builtins__ if isinstance(__builtins__, dict) else __builtins__.__dict__
        table = dict(real)
        real_import = table["__import__"]

        def spawn_import(name, *args, **kwargs):
            module = real_import(name, *args, **kwargs)
            if "matplotlib.pyplot" in sys.modules and not getattr(sys.modules["matplotlib.pyplot"], "_spawn_hooked", False):
                self.displays.configure_matplotlib()
                self.displays.install_show_hook()
            return module

        table["__import__"] = spawn_import
        return table

    def interrupt(self) -> None:
        """Raise KeyboardInterrupt in the main thread from the reader thread."""
        import ctypes

        if self.current_id is None:
            return
        ctypes.pythonapi.PyThreadState_SetAsyncExc(
            ctypes.c_ulong(self.main_thread), ctypes.py_object(KeyboardInterrupt)
        )

    # protocol out ------------------------------------------------------------

    def emit_display(self, payload: dict | None) -> None:
        if payload is None or self.current_id is None:
            return
        sys.stdout.flush()
        sys.stderr.flush()
        self.link.send({"id": self.current_id, "event": "display", "payload": payload})

    # execution ---------------------------------------------------------------

    def exec(self, req: dict) -> None:
        self.current_id = req["id"]
        code = req.get("code", "")
        file = req.get("file") or "<pool>"
        start = int(req.get("startLine") or 1)
        self.namespace["__file__"] = file
        before = time.perf_counter()
        ok = True
        try:
            self.displays.configure_matplotlib()
            self.displays.install_show_hook()
            self.run(code, file, start)
        except KeyboardInterrupt:
            ok = False
            self.emit_display({"kind": "error", "type": "KeyboardInterrupt", "message": "interrupted", "traceback": "KeyboardInterrupt: interrupted by SPAWN"})
        except BaseException as err:  # noqa: BLE001 - anything the code raised
            ok = False
            self.emit_display(self.error_payload(err))
        finally:
            try:
                self.displays.install_show_hook()
                self.displays.harvest_figures()
            except Exception:
                pass
            sys.stdout.flush()
            sys.stderr.flush()
            self.link.send(
                {
                    "id": req["id"],
                    "event": "done",
                    "ok": ok,
                    "durationMs": int((time.perf_counter() - before) * 1000),
                }
            )
            self.current_id = None

    def run(self, code: str, file: str, start: int) -> None:
        tree = ast.parse(code, filename=file)
        if start > 1:
            ast.increment_lineno(tree, start - 1)
        keys_before = set(self.namespace)
        last_stmt = tree.body[-1] if tree.body else None
        # A triple-quoted string as the first statement is a docstring, not
        # a value to echo; a plain 'text' at the end of a cell still echoes.
        is_docstring = (
            len(tree.body) == 1
            and isinstance(last_stmt, ast.Expr)
            and isinstance(last_stmt.value, ast.Constant)
            and isinstance(last_stmt.value.value, str)
            and (ast.get_source_segment(code, last_stmt) or "").lstrip()[:3] in ('"""', "\'\'\'")
        )
        if isinstance(last_stmt, ast.Expr) and not is_docstring:
            last = tree.body.pop()
            if tree.body:
                exec(compile(tree, file, "exec"), self.namespace)
            expr = ast.Expression(last.value)
            ast.copy_location(expr, last)
            value = eval(compile(expr, file, "eval"), self.namespace)
            self.namespace["_"] = value
            self.emit_display(self.displays.of(value))
        else:
            exec(compile(tree, file, "exec"), self.namespace)
        self.changed = set(self.namespace) - keys_before

    def error_payload(self, err: BaseException) -> dict:
        tb = err.__traceback__
        # Drop our own frames (this file) from the top of the traceback.
        while tb is not None and tb.tb_frame.f_code.co_filename == __file__:
            tb = tb.tb_next
        text = "".join(traceback.format_exception(type(err), err, tb))
        return {
            "kind": "error",
            "type": type(err).__name__,
            "message": str(err),
            "traceback": text,
        }

    # queries -----------------------------------------------------------------

    def inspect(self, expression: str) -> dict | None:
        """Only dotted names: looking at something must not run code."""
        parts = expression.strip().split(".")
        if not parts or not all(p.isidentifier() for p in parts):
            return None
        if parts[0] not in self.namespace:
            return None
        value = self.namespace[parts[0]]
        for attr in parts[1:]:
            try:
                value = getattr(value, attr)
            except Exception:
                return None
        return self.displays.of(value)

    def variables(self) -> list[dict]:
        out = []
        for name, value in list(self.namespace.items()):
            if name.startswith("_") or isinstance(value, (types.ModuleType, type)):
                continue
            if isinstance(value, (types.FunctionType, types.BuiltinFunctionType)):
                continue
            out.append(self.variable_info(name, value))
            if len(out) >= MAX_VARIABLES:
                break
        return out

    def variable_info(self, name: str, value) -> dict:
        kind = type(value).__name__
        shape = None
        dtype = None
        size = None
        summary = ""
        try:
            if hasattr(value, "shape") and hasattr(value, "dtype"):
                shape = [int(s) for s in value.shape]
                dtype = str(value.dtype).replace("torch.", "")
                summary = f"{tuple(shape)} {dtype}"
                nbytes = getattr(value, "nbytes", None)
                if isinstance(nbytes, int):
                    size = nbytes
                elif hasattr(value, "element_size") and hasattr(value, "numel"):
                    size = int(value.element_size() * value.numel())
            elif hasattr(value, "columns") and hasattr(value, "shape"):
                shape = [int(s) for s in value.shape]
                summary = f"{kind} {shape[0]}×{shape[1]}"
            elif isinstance(value, (list, tuple, set, dict, str, bytes)):
                summary = f"{kind}[{len(value)}]"
                if isinstance(value, str):
                    summary = safe_repr(value)[:80]
            else:
                summary = safe_repr(value)
        except Exception:
            summary = kind
        if len(summary) > 80:
            summary = summary[:77] + "..."
        return {
            "name": name,
            "type": kind,
            "summary": summary,
            "shape": shape,
            "dtype": dtype,
            "size": size,
            "changed": name in self.changed,
        }


# ── main loop ───────────────────────────────────────────────────────────────

EMIT = lambda payload: None  # noqa: E731 - rebound once the pool exists


def main() -> None:
    global EMIT
    link = connect()
    pool = Pool(link)
    EMIT = pool.emit_display
    requests: queue.Queue = queue.Queue()

    def reader() -> None:
        try:
            for line in link.lines():
                try:
                    req = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if req.get("op") == "interrupt":
                    pool.interrupt()
                    continue
                requests.put(req)
        finally:
            requests.put({"op": "shutdown"})

    threading.Thread(target=reader, name="spawn-pool-reader", daemon=True).start()

    if hasattr(signal, "SIGBREAK"):
        # Windows: SPAWN sends CTRL_BREAK; make it behave like SIGINT.
        signal.signal(signal.SIGBREAK, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))

    link.send({"event": "ready", "python": sys.version.split()[0], "pid": os.getpid()})

    while True:
        try:
            req = requests.get()
        except KeyboardInterrupt:
            continue  # an interrupt while idle is nothing
        op = req.get("op")
        rid = req.get("id")
        try:
            if op == "exec":
                pool.exec(req)
            elif op == "inspect":
                link.send({"id": rid, "event": "result", "data": pool.inspect(req.get("expression", ""))})
            elif op == "variables":
                link.send({"id": rid, "event": "result", "data": pool.variables()})
            elif op == "table_rows":
                rows = pool.displays.table_rows(req.get("ref", ""), int(req.get("rowStart", 0)), int(req.get("count", 100)))
                link.send({"id": rid, "event": "result", "data": rows})
            elif op == "configure":
                pool.displays.plot_theme = req.get("plot")
                pool.displays.configure_matplotlib()
                link.send({"id": rid, "event": "result", "data": True})
            elif op == "shutdown":
                break
            else:
                link.send({"id": rid, "event": "result", "data": None})
        except KeyboardInterrupt:
            if rid is not None:
                link.send({"id": rid, "event": "result", "data": None})
        except Exception as err:  # never let a protocol bug take the pool down
            link.send({"id": rid, "event": "result", "data": None, "error": f"{type(err).__name__}: {err}"})


if __name__ == "__main__":
    main()
