import { describe, expect, it } from "vitest";

import type { MemoryInfo, MlInfo } from "../ipc/env";
import type { VariableInfo } from "../pool/protocol";
import { evaluateNudges, formatBytes, pickNudge } from "./rules";

const GB = 1024 ** 3;

function v(partial: Partial<VariableInfo> & { name: string }): VariableInfo {
  return {
    type: "ndarray",
    summary: "",
    shape: [1],
    dtype: "float64",
    size: null,
    device: null,
    ...partial,
  };
}

const ml = (device: MlInfo["device"], deviceName: string | null = null): MlInfo => ({
  numpy: "2.0",
  pandas: null,
  torch: "2.4",
  device,
  deviceName,
  cuda: null,
  gpuMemUsed: null,
  gpuMemTotal: null,
  jax: null,
});

const memory = (totalGb: number, usedGb: number): MemoryInfo => ({
  total: totalGb * GB,
  used: usedGb * GB,
});

describe("evaluateNudges", () => {
  it("says nothing for an empty console", () => {
    expect(evaluateNudges({ variables: [], ml: ml("cuda"), memory: memory(24, 4) })).toEqual([]);
  });

  it("suggests the accelerator when tensors sit on the CPU", () => {
    const vars = [v({ name: "t", type: "Tensor", device: "cpu" })];
    expect(
      evaluateNudges({ variables: vars, ml: ml("mps"), memory: null }).map((n) => n.message),
    ).toEqual(["This run is on CPU. MPS is available and would be much faster."]);
    expect(
      evaluateNudges({ variables: vars, ml: ml("cuda", "NVIDIA RTX 4090"), memory: null })[0]
        ?.message,
    ).toBe("This run is on CPU. CUDA (NVIDIA RTX 4090) is available and would be much faster.");
  });

  it("stays quiet when the tensors already use the accelerator, or there is none", () => {
    expect(
      evaluateNudges({
        variables: [v({ name: "t", device: "cuda" })],
        ml: ml("cuda"),
        memory: null,
      }),
    ).toEqual([]);
    expect(
      evaluateNudges({ variables: [v({ name: "t", device: "cpu" })], ml: ml("cpu"), memory: null }),
    ).toEqual([]);
    expect(
      evaluateNudges({ variables: [v({ name: "t", device: "cpu" })], ml: null, memory: null }),
    ).toEqual([]);
  });

  it("names one variable that takes more than a quarter of RAM", () => {
    const out = evaluateNudges({
      variables: [v({ name: "data", size: 7 * GB })],
      ml: null,
      memory: memory(24, 8),
    });
    expect(out.map((n) => n.message)).toEqual([
      "The array data is 7 GB, and this machine has 24 GB.",
    ]);
    expect(out[0]?.id).toBe("big-variable:data");
  });

  it("uses the right word for tensors and DataFrames", () => {
    expect(
      evaluateNudges({
        variables: [v({ name: "x", type: "Tensor", size: 7 * GB })],
        ml: null,
        memory: memory(24, 8),
      })[0]?.message,
    ).toBe("The tensor x is 7 GB, and this machine has 24 GB.");
    expect(
      evaluateNudges({
        variables: [v({ name: "df", type: "DataFrame", shape: [1, 1], dtype: null, size: 7 * GB })],
        ml: null,
        memory: memory(24, 8),
      })[0]?.message,
    ).toBe("The DataFrame df is 7 GB, and this machine has 24 GB.");
  });

  it("adds up variables that together pass 60% of RAM", () => {
    const vars = [
      v({ name: "a", size: 5 * GB }),
      v({ name: "b", size: 5 * GB }),
      v({ name: "c", size: 5 * GB }),
    ];
    const out = evaluateNudges({ variables: vars, ml: null, memory: memory(24, 2) });
    expect(out.map((n) => n.id)).toEqual(["big-total", "console-heavy"]);
    expect(out[0]?.message).toBe("Your variables hold 15 GB together, and this machine has 24 GB.");
  });

  it("suggests a restart when the console holds most of what is left", () => {
    const vars = [v({ name: "a", size: 5 * GB }), v({ name: "b", size: 5 * GB })];
    const out = evaluateNudges({ variables: vars, ml: null, memory: memory(64, 50) });
    expect(out.map((n) => n.message)).toEqual([
      "The console holds 10 GB of arrays; restart it to free memory if you are done with them.",
    ]);
  });

  it("does not call a small console heavy on a nearly full machine", () => {
    const out = evaluateNudges({
      variables: [v({ name: "a", size: 200 * 1024 ** 2 })],
      ml: null,
      memory: memory(8, 7.9),
    });
    expect(out).toEqual([]);
  });

  it("orders the device nudge first", () => {
    const vars = [v({ name: "t", type: "Tensor", device: "cpu", size: 10 * GB })];
    expect(
      evaluateNudges({ variables: vars, ml: ml("cuda"), memory: memory(16, 2) }).map((n) => n.id),
    ).toEqual(["device-cpu-cuda", "big-variable:t", "big-total", "console-heavy"]);
  });
});

describe("pickNudge", () => {
  const list = [
    { id: "a", message: "A" },
    { id: "b", message: "B" },
  ];
  it("shows the first that was neither dismissed nor put off", () => {
    expect(pickNudge(list, [], new Set())?.id).toBe("a");
    expect(pickNudge(list, ["a"], new Set())?.id).toBe("b");
    expect(pickNudge(list, [], new Set(["a"]))?.id).toBe("b");
    expect(pickNudge(list, ["a"], new Set(["b"]))).toBeNull();
  });
});

describe("formatBytes", () => {
  it("rounds sensibly", () => {
    expect(formatBytes(24 * GB)).toBe("24 GB");
    expect(formatBytes(1.5 * GB)).toBe("1.5 GB");
    expect(formatBytes(6.04 * GB)).toBe("6 GB");
    expect(formatBytes(800 * 1024 ** 2)).toBe("800 MB");
  });
});
