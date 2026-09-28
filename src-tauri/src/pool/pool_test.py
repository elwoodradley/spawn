"""Exercise pool.py end to end without SPAWN: a tiny host on a local socket.

    python pool_test.py /path/to/python

Starts pool.py under the given interpreter, sends a few requests, and
prints a compact summary of what came back. Exit code is non-zero if any
expectation fails. Needs numpy, pandas and matplotlib in that interpreter
for the rich checks; they are skipped otherwise.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = os.path.join(HERE, "pool.py")


def main(python: str) -> int:
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]
    token = secrets.token_hex(16)
    env = dict(os.environ, SPAWN_POOL_PORT=str(port), SPAWN_POOL_TOKEN=token, MPLBACKEND="Agg", PYTHONUNBUFFERED="1")
    child = subprocess.Popen([python, "-u", POOL], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    conn, _ = server.accept()
    reader = conn.makefile("r", encoding="utf-8")
    assert reader.readline().strip() == token, "token mismatch"
    ready = json.loads(reader.readline())
    print("ready:", ready)

    failures = 0
    rid = 0

    def request(op: str, **fields) -> list[dict]:
        nonlocal rid
        rid += 1
        conn.sendall((json.dumps({"id": rid, "op": op, **fields}) + "\n").encode())
        events = []
        while True:
            msg = json.loads(reader.readline())
            events.append(msg)
            if msg.get("event") in ("done", "result"):
                return events

    def expect(cond: bool, label: str) -> None:
        nonlocal failures
        print(("ok  " if cond else "FAIL"), label)
        if not cond:
            failures += 1

    ev = request("exec", code="x = 1 + 1\nx", file="t.py", startLine=1, scope="cell")
    expect(ev[0]["event"] == "display" and ev[0]["payload"] == {"kind": "text", "text": "2"}, "bare expression echoes")
    expect(ev[-1]["ok"] is True, "exec ok")

    ev = request("exec", code='"""a docstring"""\nz = 3', file="t.py", startLine=1, scope="cell")
    expect(len(ev) == 1, "a bare string constant is a docstring, not output")
    ev = request("exec", code='"""only a docstring"""', file="t.py", startLine=1, scope="cell")
    expect(len(ev) == 1, "a lone docstring cell prints nothing")

    ev = request("exec", code="print('hello from pool')", file="t.py", startLine=1, scope="cell")
    expect(ev[-1]["ok"] is True and len(ev) == 1, "print goes to stdout, not the socket")

    ev = request("exec", code="y = x + 40\n", file="t.py", startLine=5, scope="cell")
    ev = request("variables")
    names = {v["name"]: v for v in ev[-1]["data"]}
    expect(names.get("y", {}).get("summary") == "42", "state persists between execs")

    import tempfile
    work = tempfile.mkdtemp(prefix="spawn-cwd-")
    sub = os.path.join(work, "puzzles")
    os.makedirs(sub)
    with open(os.path.join(sub, "helper.py"), "w") as fh:
        fh.write("VALUE = 'beside the file'\n")
    with open(os.path.join(sub, "data.txt"), "w") as fh:
        fh.write("found\n")
    script = os.path.join(sub, "tester.py")
    ev = request("exec", code="import os, sys\nos.getcwd()", file=script, startLine=1, scope="cell", cwd=sub)
    expect(ev[0]["payload"]["text"] == repr(os.path.realpath(sub)) or ev[0]["payload"]["text"] == repr(sub), "exec chdirs to the requested working directory")
    ev = request("exec", code="sys.path[0]", file=script, startLine=1, scope="cell", cwd=sub)
    expect(ev[0]["payload"]["text"] == repr(sub), "the file's folder is first on sys.path")
    ev = request("exec", code="import helper\nopen('data.txt').read().strip() + ' / ' + helper.VALUE", file=script, startLine=1, scope="cell", cwd=sub)
    expect(ev[0]["payload"]["text"] == repr("found / beside the file"), "relative paths and sibling imports resolve like `python tester.py`")
    ev2 = request("exec", code="sys.path.count(sys.path[0])", file=script, startLine=1, scope="cell", cwd=sub)
    expect(ev2[0]["payload"]["text"] == "1", "the sys.path entry is replaced, not accumulated")
    ev = request("exec", code="os.getcwd()", file=os.path.join(work, "top.py"), startLine=1, scope="cell", cwd=work)
    expect(ev[0]["payload"]["text"] in (repr(work), repr(os.path.realpath(work))), "a later exec can move the working directory again")

    ev = request("exec", code="\n\n1/0", file="t.py", startLine=10, scope="cell")
    err = ev[0]["payload"]
    expect(err["kind"] == "error" and err["type"] == "ZeroDivisionError", "errors become payloads")
    expect('line 12' in err["traceback"], "traceback lines are offset by startLine")
    expect("pool.py" not in err["traceback"], "pool internals stay out of tracebacks")
    ev = request("exec", code="import definitely_not_a_module", file="t.py", startLine=1, scope="cell")
    expect("spawn_import" not in ev[0]["payload"]["traceback"], "the import hook frame is hidden too")

    ev = request("inspect", expression="x")
    expect(ev[-1]["data"] == {"kind": "text", "text": "2"}, "inspect a name")
    ev = request("inspect", expression="x + 1")
    expect(ev[-1]["data"] is None, "inspect refuses expressions")

    try:
        import numpy  # noqa: F401  (only to decide whether to run the rich checks here)

        rich = True
    except ImportError:
        rich = False
    probe = subprocess.run([python, "-c", "import numpy, pandas, matplotlib"], capture_output=True)
    rich = probe.returncode == 0
    if rich:
        ev = request("exec", code="import numpy as np\na = np.arange(24.).reshape(2,3,4)\na", file="t.py", startLine=1, scope="cell")
        arr = ev[0]["payload"]
        expect(arr["kind"] == "array" and arr["shape"] == [2, 3, 4] and arr["previewAxes"] == [0, 1], "numpy array payload")
        expect(arr["stats"]["max"] == 23.0, "array stats")

        ev = request("exec", code="import pandas as pd\ndf = pd.DataFrame({'a':[1,2,None],'b':['x','y','z']})\ndf", file="t.py", startLine=1, scope="cell")
        tab = ev[0]["payload"]
        expect(tab["kind"] == "table" and tab["shape"] == [3, 2] and tab["columns"][0]["nulls"] == 1, "DataFrame payload")
        ref = tab["ref"]
        ev = request("table_rows", ref=ref, rowStart=1, count=5)
        expect(len(ev[-1]["data"]) == 2, "table paging")

        code = (
            "import matplotlib.pyplot as plt\n"
            "plt.figure(); plt.plot([1,2,3]); plt.title('one'); plt.show()\n"
            "plt.figure(); plt.plot([3,2,1]); plt.show()\n"
        )
        ev = request("exec", code=code, file="t.py", startLine=1, scope="cell")
        figs = [e for e in ev if e.get("event") == "display" and e["payload"]["kind"] == "figure"]
        expect(len(figs) == 2, "both plt.show() figures captured")
        expect(figs[0]["payload"]["title"] == "one", "figure title")

        ev = request("exec", code="fig, ax = plt.subplots(); ax.plot([1]); fig", file="t.py", startLine=1, scope="cell")
        figs = [e for e in ev if e.get("event") == "display" and e["payload"]["kind"] == "figure"]
        expect(len(figs) == 1, "a bare figure renders once, not twice")
        code = (
            "y_true = np.array([0,0,1,1,2,2,2,1,0,2])\n"
            "y_pred = np.array([0,1,1,1,2,0,2,1,0,2])\n"
            "cm = np.array([[2,1,0],[0,3,0],[1,0,3]])\n"
            "cm"
        )
        ev = request("exec", code=code, file="t.py", startLine=1, scope="cell")
        mat = ev[0]["payload"]
        expect(mat["kind"] == "matrix" and mat["values"] == [[2, 1, 0], [0, 3, 0], [1, 0, 3]], "confusion matrix payload")
        expect(mat["rowTotals"] == [3, 3, 4] and mat["colTotals"] == [3, 4, 3], "matrix totals")
        expect(abs(mat["perClass"][1]["precision"] - 0.75) < 1e-9 and mat["perClass"][1]["recall"] == 1.0, "per-class precision/recall")
        expect(mat["samples"] is True, "y_true/y_pred found in the namespace")
        ev = request("matrix_cells", ref=mat["ref"], row=2, col=0)
        expect(ev[-1]["data"] == [5], "matrix_cells returns the sample indices for a cell")
        ev = request("matrix_cells", ref=mat["ref"], row=0, col=1)
        expect(ev[-1]["data"] == [1], "off-diagonal cell indices")

        ev = request("exec", code="ct = pd.crosstab(pd.Series(y_true, name='true'), pd.Series(y_pred, name='pred'))\nct", file="t.py", startLine=1, scope="cell")
        expect(ev[0]["payload"]["kind"] == "matrix" and ev[0]["payload"]["labels"] == ["0", "1", "2"], "a crosstab DataFrame is a labelled matrix")

        ev = request("exec", code="imgs = np.random.default_rng(0).normal(size=(8, 3, 16, 16)).astype('float32')\nimgs", file="t.py", startLine=1, scope="cell")
        im = ev[0]["payload"]
        expect(im["kind"] == "images" and im["count"] == 8 and len(im["thumbs"]) == 8 and im["layout"] == "NCHW", "NCHW float batch → image grid")
        expect(im["normalized"] is True and im["thumbSize"] == [16, 16], "floats outside 0..255 are normalised")
        expect(base64.b64decode(im["thumbs"][0])[:8] == b"\x89PNG\r\n\x1a\n", "thumbs are PNG")

        ev = request("exec", code="gray = (np.random.default_rng(1).random((5, 16, 16)) * 255).astype('uint8')\ngray", file="t.py", startLine=1, scope="cell")
        im = ev[0]["payload"]
        expect(im["kind"] == "images" and im["count"] == 5 and im["layout"] == "NHW" and im["normalized"] is False, "(N, H, W) uint8 → grayscale grid")

        ev = request("exec", code="np.zeros((32, 128))", file="t.py", startLine=1, scope="cell")
        expect(ev[0]["payload"]["kind"] == "array", "a plain 2D float array stays an array card")

        report = "{'cat': {'precision': 0.8, 'recall': 0.5, 'f1-score': 0.615, 'support': 10}, 'dog': {'precision': 0.6, 'recall': 0.9, 'f1-score': 0.72, 'support': 12}, 'accuracy': {'precision': 0.7, 'recall': 0.7, 'f1-score': 0.7, 'support': 22}}"
        ev = request("exec", code=f"rep = {report}\nrep", file="t.py", startLine=1, scope="cell")
        tab = ev[0]["payload"]
        expect(tab["kind"] == "table" and tab["source"] == "other" and tab["index"] == ["cat", "dog", "accuracy"], "classification report dict → table")
        expect([c["name"] for c in tab["columns"]] == ["precision", "recall", "f1-score", "support"], "report columns")
        ev = request("table_rows", ref=tab["ref"], rowStart=1, count=5)
        expect(len(ev[-1]["data"]) == 2 and ev[-1]["data"][0][0] == 0.6, "dict table paging")

        ev = request("exec", code="{'lr': 0.01, 'epochs': 10, 'name': 'run-a'}", file="t.py", startLine=1, scope="cell")
        expect(ev[0]["payload"]["kind"] == "table" and ev[0]["payload"]["columns"][0]["name"] == "key", "flat dict → key/value table")
        ev = request("exec", code="[{'a': 1, 'b': 2.5}, {'a': 2, 'b': None}]", file="t.py", startLine=1, scope="cell")
        expect(ev[0]["payload"]["kind"] == "table" and ev[0]["payload"]["columns"][1]["nulls"] == 1, "records → table with null counts")
        ev = request("exec", code="{'nested': {'deep': {'x': 1}}}", file="t.py", startLine=1, scope="cell")
        expect(ev[0]["payload"]["kind"] == "text", "a dict with non-scalar leaves stays text")

        code = (
            "rng = np.random.default_rng(0); n = 400\n"
            "sick = pd.DataFrame({'passenger_id': np.arange(1, n + 1),"
            " 'age': rng.integers(18, 90, n).astype(float),"
            " 'income': rng.integers(1000, 250000, n).astype(float),"
            " 'region': ['north'] * n,"
            " 'price': [f'{v:.1f}' for v in rng.random(n) * 100],"
            " 'survived': (rng.random(n) < 0.1).astype(int)})\n"
            "sick.loc[rng.choice(n, 12, replace=False), 'age'] = np.nan\n"
            "sick['paid_out'] = sick['survived'] * 100.0 + rng.random(n) * 0.01\n"
            "sick = pd.concat([sick, sick.iloc[:8]], ignore_index=True)\n"
            "clean = pd.DataFrame({'a': rng.normal(size=n), 'b': rng.normal(size=n) * 3, 'c': rng.integers(0, 3, n)})\n"
            "ids = pd.DataFrame({'user_id': np.arange(n), 'x': rng.normal(size=n), 'y': rng.normal(size=n)})\n"
            "mat = np.column_stack([rng.normal(size=n), rng.normal(size=n) * 5000]); mat[3, 0] = np.nan\n"
        )
        request("exec", code=code, file="t.py", startLine=1, scope="cell")
        ev = request("dataset_health", name="sick")
        health = ev[-1]["data"]
        found = {f["id"]: f for f in health["findings"]}
        expect(health["kind"] == "dataframe" and health["rows"] == 408 and health["cols"] == 7, "dataset_health describes the frame")
        expect(found.get("missing", {}).get("detail", "").startswith("age: 12 missing of 408 (3%)"), "missing values are counted per column")
        expect(found.get("imbalance", {}).get("column") == "survived" and "accuracy means the model may have learned nothing" in found["imbalance"]["detail"], "class imbalance on the named target")
        expect(found.get("leakage", {}).get("column") == "paid_out" and "answer in disguise" in found["leakage"]["detail"], "a column correlated with the target is flagged as leakage")
        expect("income ranges from" in found.get("scale", {}).get("detail", "") and "age ranges from" in found["scale"]["detail"], "features on very different scales name both extremes")
        expect(found.get("duplicates", {}).get("title") == "8 duplicate rows", "duplicate rows are counted")
        expect(found.get("constant", {}).get("column") == "region", "a constant column is named")
        expect(found.get("numeric_text", {}).get("column") == "price", "text that looks numeric is named")
        expect([c["name"] for c in health["columns"]][:2] == ["passenger_id", "age"] and health["columns"][1]["missing"] == 12, "column table carries missing counts")
        ev = request("dataset_health", name="clean")
        expect(ev[-1]["data"]["findings"] == [], "a clean frame has no findings")
        ev = request("dataset_health", name="ids")
        expect([f["id"] for f in ev[-1]["data"]["findings"]] == ["id_column"], "a unique-integer id column is the only finding")
        ev = request("dataset_health", name="mat")
        ids = [f["id"] for f in ev[-1]["data"]["findings"]]
        expect(ev[-1]["data"]["kind"] == "array" and ids == ["missing", "scale"], "a 2-D numpy array gets missing and scale checks")
        ev = request("dataset_health", name="x")
        expect(ev[-1]["data"] is None, "dataset_health ignores non-datasets")
        ev = request("dataset_health", name="no_such_name")
        expect(ev[-1]["data"] is None, "dataset_health ignores unknown names")
    else:
        print("skip rich checks (numpy/pandas/matplotlib missing)")

    # interrupt: start a long exec, send SIGINT, expect a KeyboardInterrupt payload
    rid += 1
    conn.sendall((json.dumps({"id": rid, "op": "exec", "code": "import time\nwhile True: time.sleep(0.05)", "file": "t.py", "startLine": 1, "scope": "cell"}) + "\n").encode())
    time.sleep(0.4)
    conn.sendall((json.dumps({"op": "interrupt"}) + "\n").encode())
    msgs = []
    while True:
        msg = json.loads(reader.readline())
        msgs.append(msg)
        if msg.get("event") == "done":
            break
    expect(any(m.get("payload", {}).get("type") == "KeyboardInterrupt" for m in msgs), "interrupt stops a running exec")
    ev = request("exec", code="'alive'", file="t.py", startLine=1, scope="cell")
    if "payload" not in ev[0]:
        print("unexpected events after interrupt:", ev)
    expect(ev[0].get("payload", {}).get("text") == "'alive'", "pool survives the interrupt")

    if os.name != "nt":
        rid += 1
        conn.sendall((json.dumps({"id": rid, "op": "exec", "code": "import time\ntime.sleep(30)", "file": "t.py", "startLine": 1, "scope": "cell"}) + "\n").encode())
        time.sleep(0.3)
        child.send_signal(2)
        msgs = []
        while True:
            msg = json.loads(reader.readline())
            msgs.append(msg)
            if msg.get("event") == "done":
                break
        expect(any(m.get("payload", {}).get("type") == "KeyboardInterrupt" for m in msgs), "SIGINT interrupts a blocking sleep")

    rid += 1
    conn.sendall((json.dumps({"id": rid, "op": "shutdown"}) + "\n").encode())
    child.wait(timeout=5)
    out, err = child.communicate()
    expect("hello from pool" in out, "stdout reached the pipe")
    print("stderr tail:", err[-300:].strip() or "(empty)")
    print("failures:", failures)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else sys.executable))
