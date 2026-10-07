import { describe, expect, it } from "vitest";

import { installPlan, type InstallInput } from "./install";
import { packageFor } from "./packages";

const base: InstallInput = {
  packageName: "scikit-learn",
  uv: "/usr/bin/uv",
  interpreter: "/home/me/proj/.venv/bin/python",
  interpreterSource: "broodVenv",
  projectRoot: "/home/me/proj",
  hasPyproject: true,
};

describe("installPlan", () => {
  it("uses uv add for the project's .venv when a pyproject exists", () => {
    const plan = installPlan(base);
    expect(plan).toEqual({
      kind: "command",
      program: "/usr/bin/uv",
      args: ["add", "scikit-learn"],
      cwd: "/home/me/proj",
      display: "uv add scikit-learn",
    });
  });

  it("never installs into a system Python, whatever source it was picked from", () => {
    for (const interpreter of ["/usr/bin/python3.12", "/usr/bin/python3"]) {
      for (const interpreterSource of ["custom", "path", null] as const) {
        const plan = installPlan({ ...base, interpreter, interpreterSource });
        expect(plan.kind).toBe("select-interpreter");
      }
    }
    expect(
      installPlan({ ...base, interpreter: "/usr/local/bin/python3", interpreterSource: "path" })
        .kind,
    ).toBe("command");
  });

  it("uses uv pip install into the .venv when there is no pyproject", () => {
    const plan = installPlan({ ...base, hasPyproject: false });
    expect(plan.kind).toBe("command");
    if (plan.kind !== "command") return;
    expect(plan.args).toEqual([
      "pip",
      "install",
      "--python",
      "/home/me/proj/.venv/bin/python",
      "scikit-learn",
    ]);
    expect(plan.display).toContain("uv pip install --python");
  });

  it("targets a non-project interpreter explicitly rather than the cwd", () => {
    const plan = installPlan({
      ...base,
      interpreter: "/home/me/.local/share/uv/python/cpython-3.12/bin/python3",
      interpreterSource: "uvManaged",
    });
    expect(plan.kind).toBe("command");
    if (plan.kind !== "command") return;
    expect(plan.args[0]).toBe("pip");
    expect(plan.args).toContain("/home/me/.local/share/uv/python/cpython-3.12/bin/python3");
  });

  it("falls back to python -m pip when uv is missing, still never the system Python", () => {
    const plan = installPlan({ ...base, uv: null });
    expect(plan).toEqual({
      kind: "command",
      program: "/home/me/proj/.venv/bin/python",
      args: ["-m", "pip", "install", "scikit-learn"],
      cwd: "/home/me/proj",
      display: "python -m pip install scikit-learn",
    });
  });

  it("refuses the system Python and points at Select Python Interpreter", () => {
    const plan = installPlan({
      ...base,
      interpreter: "/usr/bin/python3",
      interpreterSource: "system",
    });
    expect(plan.kind).toBe("select-interpreter");
    if (plan.kind !== "select-interpreter") return;
    expect(plan.label).toBe("Create a .venv first");
    expect(plan.reason).toMatch(/operating system's own Python/);
  });

  it("refuses when nothing is selected", () => {
    const plan = installPlan({ ...base, interpreter: null, interpreterSource: null });
    expect(plan.kind).toBe("select-interpreter");
  });
});

describe("packageFor", () => {
  it("maps the well-known import names to their PyPI names", () => {
    expect(packageFor("cv2")).toEqual({ module: "cv2", packageName: "opencv-python", known: true });
    expect(packageFor("sklearn.linear_model").packageName).toBe("scikit-learn");
    expect(packageFor("PIL.Image").packageName).toBe("pillow");
    expect(packageFor("yaml").packageName).toBe("pyyaml");
    expect(packageFor("bs4").packageName).toBe("beautifulsoup4");
    expect(packageFor("dotenv").packageName).toBe("python-dotenv");
    expect(packageFor("skimage.io").packageName).toBe("scikit-image");
    expect(packageFor("attr").packageName).toBe("attrs");
    expect(packageFor("Crypto.Cipher").packageName).toBe("pycryptodome");
    expect(packageFor("dateutil.parser").packageName).toBe("python-dateutil");
    expect(packageFor("google.protobuf").packageName).toBe("protobuf");
    expect(packageFor("torch.nn").packageName).toBe("torch");
    expect(packageFor("torchvision.transforms").packageName).toBe("torchvision");
    expect(packageFor("tensorflow.keras").packageName).toBe("tensorflow");
    expect(packageFor("jax.numpy").packageName).toBe("jax");
  });

  it("installs an unknown module under its own name, marked as a guess", () => {
    expect(packageFor("some_lib.sub")).toEqual({
      module: "some_lib",
      packageName: "some-lib",
      known: false,
    });
  });

  it("knows the stdlib modules that cannot be installed", () => {
    expect(packageFor("tkinter").packageName).toBeNull();
    expect(packageFor("_sqlite3").packageName).toBeNull();
  });
});
