"""Dataset health check for SPAWN's Interactive Console.

Written next to pool.py in the cache dir and loaded by it on the first
`dataset_health` request. Stdlib only at import time: numpy and pandas are
reached through the user's own objects and imported by name only once the
value is known to be one of theirs.

    dataset_health(obj) -> dict | None

Returns {kind, rows, cols, sampled, partial, findings, columns} for a pandas
or polars DataFrame or a 2-D numpy array, None for anything else. Checks run
on the first SAMPLE_ROWS rows, each under its own try/except and all under a
shared deadline, so an odd column costs one check, never the report. Every
message is written for someone in their first ML course: what was found,
why it matters, what to do.
"""

from __future__ import annotations

import math
import time

SAMPLE_ROWS = 50_000
MAX_COLUMNS = 200
BUDGET_S = 0.2
MIN_ROWS = 20
IMBALANCE_SHARE = 0.80
LEAK_CORR = 0.99
LEAK_PURITY = 0.99
SCALE_RATIO = 1000.0
TARGET_MAX_CLASSES = 20
TARGET_MAX_SHARE = 0.05
NUMERIC_TEXT_SHARE = 0.95
TARGET_NAMES = {
    "target", "label", "labels", "y", "class", "classes", "outcome", "species",
    "survived", "diagnosis", "churn", "spam", "fraud", "is_fraud", "sentiment",
    "default", "defaulted", "disease", "malignant", "purchased", "clicked",
}
ID_NAMES = {"id", "idx", "index", "key", "no", "num", "number", "uid", "pk", "rowid", "row_id"}
STRING_DTYPES = ("object", "str", "string", "String", "Utf8", "large_string")


class Column:
    """One column of the sample as numpy arrays, whatever it came from."""

    def __init__(self, name: str, dtype: str, values, valid, role: str, missing: int, unique) -> None:
        self.name = name
        self.dtype = dtype
        self.values = values  # float64 for numeric, str for everything else
        self.valid = valid  # bool mask: not missing
        self.role = role  # "numeric" | "bool" | "text" | "other"
        self.missing = missing
        self.unique = unique  # int, or None when it was too costly to know


class Frame:
    def __init__(self, kind: str, rows: int, cols: int, sampled: int) -> None:
        self.kind = kind
        self.rows = rows
        self.cols = cols
        self.sampled = sampled
        self.columns: list[Column] = []
        self.duplicates = lambda: 0


# ── reading the object ──────────────────────────────────────────────────────


def describe(obj, deadline: float):
    mod = type(obj).__module__ or ""
    if mod.startswith("pandas") and hasattr(obj, "columns") and hasattr(obj, "dtypes"):
        return frame_pandas(obj, deadline)
    if mod.startswith("polars") and hasattr(obj, "columns") and hasattr(obj, "schema"):
        return frame_polars(obj, deadline)
    if mod.startswith("numpy") and getattr(obj, "ndim", 0) == 2:
        return frame_numpy(obj, deadline)
    return None


def frame_pandas(df, deadline: float) -> Frame:
    import numpy as np

    sample = df.iloc[:SAMPLE_ROWS]
    frame = Frame("dataframe", int(df.shape[0]), int(df.shape[1]), int(sample.shape[0]))
    for i in range(min(frame.cols, MAX_COLUMNS)):
        s = sample.iloc[:, i]
        try:
            frame.columns.append(column_pandas(str(sample.columns[i]), s, np, deadline))
        except Exception:
            continue
    frame.duplicates = lambda: int(sample.duplicated().sum())
    return frame


def column_pandas(name: str, s, np, deadline: float) -> Column:
    dtype = str(s.dtype)
    kind = getattr(s.dtype, "kind", "O")
    valid = ~np.asarray(s.isna(), dtype=bool)
    missing = int((~valid).sum())
    if kind == "b" or dtype in ("bool", "boolean"):
        role, values = "bool", np.asarray(s.astype(object).to_numpy()).astype(str)
    elif kind in "iuf":
        role = "numeric"
        try:
            values = np.asarray(s.to_numpy(dtype="float64", na_value=np.nan))
        except Exception:
            values = np.asarray(s.astype("float64").to_numpy())
    else:
        role = "text" if dtype.startswith(STRING_DTYPES) or dtype == "category" else "other"
        values = np.asarray(s.astype(object).to_numpy()).astype(str)
    unique = None if time.perf_counter() > deadline else int(s.nunique())
    return Column(name, dtype, values, valid, role, missing, unique)


def frame_polars(df, deadline: float) -> Frame:
    import numpy as np

    sample = df.head(SAMPLE_ROWS)
    frame = Frame("dataframe", int(df.height), int(df.width), int(sample.height))
    for name, dtype in list(sample.schema.items())[:MAX_COLUMNS]:
        try:
            frame.columns.append(column_polars(str(name), str(dtype), sample.get_column(name), dtype, np, deadline))
        except Exception:
            continue
    frame.duplicates = lambda: int(sample.height - sample.n_unique())
    return frame


def column_polars(name: str, dtype: str, s, pl_dtype, np, deadline: float) -> Column:
    valid = ~np.asarray(s.is_null().to_numpy(), dtype=bool)
    missing = int(s.null_count())
    if dtype == "Boolean":
        role, values = "bool", np.asarray(s.to_numpy()).astype(str)
    elif pl_dtype.is_numeric():
        role, values = "numeric", np.asarray(s.to_numpy(), dtype="float64")
    else:
        role = "text" if dtype in ("String", "Utf8", "Categorical", "Enum") else "other"
        values = np.asarray(s.to_numpy()).astype(str)
    unique = None
    if time.perf_counter() <= deadline:
        unique = int(s.n_unique()) - (1 if missing else 0)
    return Column(name, dtype, values, valid, role, missing, unique)


def frame_numpy(arr, deadline: float) -> Frame:
    import numpy as np

    sample = np.asarray(arr[:SAMPLE_ROWS])
    frame = Frame("array", int(arr.shape[0]), int(arr.shape[1]), int(sample.shape[0]))
    kind = sample.dtype.kind
    for j in range(min(frame.cols, MAX_COLUMNS)):
        try:
            frame.columns.append(column_numpy(f"column {j}", sample[:, j], kind, np, deadline))
        except Exception:
            continue
    if kind in "iufb":
        frame.duplicates = lambda: int(sample.shape[0] - len(np.unique(sample, axis=0)))
    return frame


def column_numpy(name: str, col, kind: str, np, deadline: float) -> Column:
    dtype = str(col.dtype)
    if kind in "iuf":
        values = col.astype("float64")
        valid = ~np.isnan(values)
        role = "numeric"
    elif kind == "b":
        values, valid, role = col.astype(str), np.ones(len(col), dtype=bool), "bool"
    elif kind in "US":
        values, role = col.astype(str), "text"
        valid = values != ""
    else:
        valid = np.fromiter(
            (v is not None and not (isinstance(v, float) and math.isnan(v)) for v in col), dtype=bool, count=len(col)
        )
        values, role = col.astype(str), "text"
    missing = int((~valid).sum())
    unique = None if time.perf_counter() > deadline else int(len(np.unique(values[valid])))
    return Column(name, dtype, values, valid, role, missing, unique)


# ── wording helpers ─────────────────────────────────────────────────────────


def pct(share: float) -> str:
    p = share * 100
    if p == 0:
        return "0%"
    if p < 1:
        return f"{p:.1f}%"
    return f"{p:.0f}%"


def num(x: float) -> str:
    if abs(x) >= 1000:
        return f"{x:,.0f}" if abs(x) < 1e15 else f"{x:.3g}"
    if abs(x - round(x)) < 1e-9:
        return f"{int(round(x))}"
    return f"{x:.4g}"


def class_name(col: Column, value) -> str:
    if col.role == "numeric":
        return num(float(value))
    return f'"{value}"'


def is_id_name(name: str) -> bool:
    lower = name.strip().lower()
    if lower in ID_NAMES or lower.endswith(("_id", "_idx", "_index", "_key", "_no", "_num", "_number")):
        return True
    return len(name) > 2 and name.endswith(("Id", "ID"))


def codes(col: Column, mask, np):
    return np.unique(col.values[mask], return_inverse=True)


def finding(fid: str, severity: str, title: str, detail: str, column=None) -> dict:
    return {"id": fid, "severity": severity, "title": title, "detail": detail, "column": column}


# ── the checks ──────────────────────────────────────────────────────────────


def find_target(frame: Frame):
    for c in frame.columns:
        lower = c.name.strip().lower()
        if lower in TARGET_NAMES or lower.endswith(("_label", "_target", "_class")):
            return c
    last = frame.columns[-1]
    if last.unique is not None and 2 <= last.unique <= min(TARGET_MAX_CLASSES, TARGET_MAX_SHARE * frame.sampled):
        return last
    return None


def is_classification(target) -> bool:
    return target is not None and target.unique is not None and 2 <= target.unique <= TARGET_MAX_CLASSES


def check_missing(frame: Frame, np) -> list[dict]:
    n = frame.sampled
    hit = [c for c in frame.columns if c.missing > 0]
    if not hit:
        return []
    parts = [f"{c.name}: {c.missing} missing of {n} ({pct(c.missing / n)})" for c in hit[:6]]
    if len(hit) > 6:
        parts.append(f"and {len(hit) - 6} more columns")
    title = "Missing values in 1 column" if len(hit) == 1 else f"Missing values in {len(hit)} columns"
    detail = (
        "; ".join(parts)
        + ". Most models cannot train on missing values: fill them in (for example with the column's median or most common value) or drop those rows first."
    )
    return [finding("missing", "warn", title, detail, hit[0].name if len(hit) == 1 else None)]


def check_numeric_text(frame: Frame, np) -> list[dict]:
    out = []
    for c in frame.columns:
        if c.role != "text" or not (c.dtype.startswith(STRING_DTYPES) or c.dtype.startswith("<U") or c.dtype.startswith("|S")):
            continue
        sample = c.values[c.valid][:2000]
        if len(sample) < 10:
            continue
        parsed = 0
        example = None
        for v in sample:
            text = str(v).strip()
            if text.lower() in ("nan", "inf", "-inf", "infinity", "-infinity", ""):
                continue
            try:
                float(text)
            except ValueError:
                continue
            parsed += 1
            example = example or text
        if parsed / len(sample) >= NUMERIC_TEXT_SHARE and example is not None:
            fix = (
                f'pd.to_numeric(df["{c.name}"], errors="coerce")'
                if frame.kind == "dataframe"
                else "arr.astype(float)"
            )
            out.append(
                finding(
                    "numeric_text",
                    "warn",
                    f"{c.name} is text that looks numeric",
                    f'Its values are strings like "{example}", so a model sees labels, not amounts. Convert it with {fix} and look at any value that fails to convert.',
                    c.name,
                )
            )
    return out[:3]


def check_imbalance(frame: Frame, target, np) -> list[dict]:
    if not is_classification(target):
        return []
    uniques, inverse = codes(target, target.valid, np)
    counts = np.bincount(inverse)
    total = int(counts.sum())
    if total < MIN_ROWS:
        return []
    top = int(counts.argmax())
    share = counts[top] / total
    if share < IMBALANCE_SHARE:
        return []
    label = class_name(target, uniques[top])
    return [
        finding(
            "imbalance",
            "warn",
            f"Class imbalance in {target.name}",
            f"{pct(share)} of rows are class {label}, so {pct(share)} accuracy means the model may have learned nothing. "
            "Judge it with a confusion matrix, precision and recall, or balanced accuracy, not accuracy alone.",
            target.name,
        )
    ]


def check_leakage(frame: Frame, target, np) -> list[dict]:
    if target is None:
        return []
    classify = is_classification(target)
    out = []
    for c in frame.columns:
        if c is target or (c.unique is not None and c.unique <= 1):
            continue
        both = c.valid & target.valid
        m = int(both.sum())
        if m < MIN_ROWS:
            continue
        try:
            if c.role == "numeric" and target.role == "numeric" and (not classify or (c.unique or 0) > TARGET_MAX_CLASSES):
                x, y = c.values[both], target.values[both]
                if x.std() == 0 or y.std() == 0:
                    continue
                r = float(np.corrcoef(x, y)[0, 1])
                if math.isfinite(r) and abs(r) >= LEAK_CORR:
                    out.append(leak(c, target, f"It matches the target {target.name} almost exactly (correlation {r:.3f})"))
            elif classify and c.unique is not None and c.unique <= target.unique:
                _, ic = codes(c, both, np)
                ut, it = codes(target, both, np)
                table = np.bincount(ic * len(ut) + it, minlength=(ic.max() + 1) * len(ut)).reshape(-1, len(ut))
                purity = float(table.max(axis=1).sum() / m)
                if purity >= LEAK_PURITY:
                    out.append(leak(c, target, f"Each of its values maps to one value of the target {target.name} ({pct(purity)} of rows)"))
        except Exception:
            continue
    return out[:3]


def leak(c: Column, target: Column, how: str) -> dict:
    return finding(
        "leakage",
        "warn",
        f"{c.name} looks like leakage",
        f"{how}: it may be the answer in disguise. A model that uses it will look perfect here and fail on new data, "
        f"where {c.name} is not known yet. Check where this column comes from before training on it.",
        c.name,
    )


def check_scales(frame: Frame, target, np) -> list[dict]:
    spans = []
    for c in frame.columns:
        if c.role != "numeric" or c is target or (c.unique is not None and c.unique <= 2) or is_id_name(c.name):
            continue
        vals = c.values[c.valid]
        if len(vals) < MIN_ROWS:
            continue
        lo, hi = float(vals.min()), float(vals.max())
        if math.isfinite(lo) and math.isfinite(hi) and hi > lo:
            spans.append((hi - lo, lo, hi, c))
    if len(spans) < 2:
        return []
    spans.sort(key=lambda s: s[0])
    small, big = spans[0], spans[-1]
    ratio = big[0] / small[0]
    if ratio < SCALE_RATIO:
        return []
    return [
        finding(
            "scale",
            "info",
            "Features on very different scales",
            f"{big[3].name} ranges from {num(big[1])} to {num(big[2])} while {small[3].name} ranges from {num(small[1])} to {num(small[2])} "
            f"(about {num(round(ratio))}× narrower); scaling helps most models. Without it, distance-based and gradient-trained models "
            "(k-NN, linear and logistic regression, neural networks) let the biggest numbers dominate. StandardScaler or MinMaxScaler fixes it.",
        )
    ]


def check_duplicates(frame: Frame, np) -> list[dict]:
    count = int(frame.duplicates())
    n = frame.sampled
    if count < max(2, math.ceil(0.01 * n)):
        return []
    fix = "df.drop_duplicates() removes them" if frame.kind == "dataframe" else "np.unique(arr, axis=0) keeps one of each"
    return [
        finding(
            "duplicates",
            "info",
            f"{count} duplicate rows",
            f"{count} rows are exact copies of another row ({pct(count / n)}). Copies can land in both the training and the test split, "
            f"which makes scores look better than they really are. {fix}.",
        )
    ]


def check_constant(frame: Frame, np) -> list[dict]:
    hit = [c for c in frame.columns if c.unique == 1 and c.missing < frame.sampled]
    if not hit:
        return []
    names = ", ".join(c.name for c in hit[:5]) + (f" and {len(hit) - 5} more" if len(hit) > 5 else "")
    verb = "has" if len(hit) == 1 else "have"
    title = "Constant column" if len(hit) == 1 else f"{len(hit)} constant columns"
    return [
        finding(
            "constant",
            "info",
            title,
            f"{names} {verb} the same value in every row, so it cannot help a model tell rows apart. Drop it from the features.",
            hit[0].name if len(hit) == 1 else None,
        )
    ]


def check_ids(frame: Frame, target, np) -> list[dict]:
    out = []
    n = frame.sampled
    for c in frame.columns:
        if c.role != "numeric" or c is target or c.missing or c.unique != n or n < MIN_ROWS:
            continue
        vals = c.values
        if not bool(np.all(vals == np.floor(vals))):
            continue
        consecutive = float(vals.max() - vals.min()) == n - 1
        if not (is_id_name(c.name) or consecutive):
            continue
        out.append(
            finding(
                "id_column",
                "info",
                f"{c.name} looks like an ID",
                "It is a different whole number in every row, like a row number. There is no pattern in it to learn, "
                "so leave it out of the features; a model may memorise it instead of learning from the real ones.",
                c.name,
            )
        )
    return out[:3]


# ── entry point ─────────────────────────────────────────────────────────────


def dataset_health(obj) -> dict | None:
    deadline = time.perf_counter() + BUDGET_S
    try:
        frame = describe(obj, deadline)
    except Exception:
        return None
    if frame is None:
        return None
    findings: list[dict] = []
    partial = False
    if frame.columns and frame.sampled >= MIN_ROWS:
        import numpy as np

        try:
            target = find_target(frame)
        except Exception:
            target = None
        checks = [
            lambda: check_missing(frame, np),
            lambda: check_numeric_text(frame, np),
            lambda: check_imbalance(frame, target, np),
            lambda: check_leakage(frame, target, np),
            lambda: check_scales(frame, target, np),
            lambda: check_duplicates(frame, np),
            lambda: check_constant(frame, np),
            lambda: check_ids(frame, target, np),
        ]
        for check in checks:
            if time.perf_counter() > deadline:
                partial = True
                break
            try:
                findings.extend(check())
            except Exception:
                continue
    if any(c.unique is None for c in frame.columns):
        partial = True
    return {
        "kind": frame.kind,
        "rows": frame.rows,
        "cols": frame.cols,
        "sampled": frame.sampled,
        "partial": partial,
        "findings": findings,
        "columns": [
            {"name": c.name, "dtype": c.dtype, "missing": c.missing, "unique": c.unique} for c in frame.columns
        ],
    }
