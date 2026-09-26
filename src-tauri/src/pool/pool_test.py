"""Exercise pool.py end to end without SPAWN: a tiny host on a local socket.

    python pool_test.py /path/to/python

Starts pool.py under the given interpreter, sends a few requests, and
prints a compact summary of what came back. Exit code is non-zero if any
expectation fails. Needs numpy, pandas and matplotlib in that interpreter
for the rich checks; they are skipped otherwise.
"""

from __future__ import annotations

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

    ev = request("exec", code="\n\n1/0", file="t.py", startLine=10, scope="cell")
    err = ev[0]["payload"]
    expect(err["kind"] == "error" and err["type"] == "ZeroDivisionError", "errors become payloads")
    expect('line 12' in err["traceback"], "traceback lines are offset by startLine")

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
