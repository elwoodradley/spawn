/** The numpy / torch / scikit-learn entries, fed the real message text. */
import { describe, expect, it } from "vitest";

import { parseCroak } from "../spawn/croak";
import { explain } from "./match";
import { broadcastConflict } from "./shapes";
import type { ErrorContext } from "./types";

const CTX: ErrorContext = {
  source: "run",
  cwd: "/home/me/proj",
  projectRoot: "/home/me/proj",
  consoleVariables: [],
};

function run(last: string) {
  const croak = parseCroak(
    `Traceback (most recent call last):\n  File "/home/me/proj/train.py", line 20, in <module>\n    step()\n${last}\n`,
  );
  if (!croak) throw new Error("test traceback did not parse");
  const ex = explain(croak, CTX);
  if (!ex) throw new Error(`no explanation for ${last}`);
  return ex;
}

describe("shape mismatch", () => {
  it("numpy broadcasting: both shapes and the axis that disagrees", () => {
    const ex = run("ValueError: operands could not be broadcast together with shapes (3,4) (4,3)");
    expect(ex.id).toBe("shape-mismatch");
    expect(ex.facts).toEqual([
      { label: "First", value: "(3, 4)" },
      { label: "Second", value: "(4, 3)" },
    ]);
    expect(ex.body[0]).toContain("the last axis: 4 versus 3");
    expect(ex.where).toEqual({ file: "/home/me/proj/train.py", line: 20 });
  });

  it("broadcastConflict aligns from the right and lets 1 stretch", () => {
    expect(broadcastConflict([3, 4], [4, 3])).toBe("the last axis: 4 versus 3");
    expect(broadcastConflict([2, 3, 4], [5, 4])).toBe("the last-but-1 axis: 3 versus 5");
    expect(broadcastConflict([3, 1], [1, 4])).toBeNull();
  });

  it("numpy dot: inner sizes", () => {
    const ex = run("ValueError: shapes (3,4) and (5,6) not aligned: 4 (dim 1) != 5 (dim 0)");
    expect(ex.title).toBe("Matrix multiplication: the inner sizes do not match");
    expect(ex.body[0]).toContain("4 against 5");
  });

  it("torch Linear: in_features against the input", () => {
    const ex = run("RuntimeError: mat1 and mat2 shapes cannot be multiplied (32x784 and 512x10)");
    expect(ex.title).toBe("A Linear layer expected 512 input features but got 784");
    expect(ex.facts).toEqual([
      { label: "Input", value: "(32, 784)" },
      { label: "Layer expects", value: "in_features=512, out_features=10" },
    ]);
    expect(ex.todo?.[0]).toContain("in_features=784");
  });

  it("torch load_state_dict: the first line of the message, then a single mismatch", () => {
    const ex = run(
      "RuntimeError: Error(s) in loading state_dict for Net:\n\tsize mismatch for fc.weight: copying a param with shape torch.Size([10, 512]) from checkpoint, the shape in current model is torch.Size([10, 784]).",
    );
    expect(ex.title).toBe("The saved weights were made by a different model");
    expect(ex.body[0]).toContain("Some parameters of Net");
    const one = run(
      "RuntimeError: size mismatch for fc.weight: copying a param with shape torch.Size([10, 512]) from checkpoint, the shape in current model is torch.Size([10, 784]).",
    );
    expect(one.facts).toEqual([
      { label: "Checkpoint", value: "(10, 512)" },
      { label: "Your model", value: "(10, 784)" },
    ]);
  });

  it("batch sizes, tensor a / b, BCE target size", () => {
    expect(
      run("ValueError: Expected input batch_size (32) to match target batch_size (16).").title,
    ).toBe("The loss got predictions for 32 examples but labels for 16");
    const ab = run(
      "RuntimeError: The size of tensor a (3) must match the size of tensor b (4) at non-singleton dimension 1",
    );
    expect(ab.title).toBe("Two tensors disagree on dimension 1: 3 versus 4");
    const bce = run(
      "ValueError: Target size (torch.Size([32])) must be the same as input size (torch.Size([32, 1]))",
    );
    expect(bce.facts).toEqual([
      { label: "Predictions", value: "(32, 1)" },
      { label: "Labels", value: "(32)" },
    ]);
  });

  it("scikit-learn feature count, sample count and 1D input", () => {
    const feat = run(
      "ValueError: X has 4 features, but LinearRegression is expecting 5 features as input.",
    );
    expect(feat.title).toBe("The model was trained on 5 columns but was given 4");
    const n = run(
      "ValueError: Found input variables with inconsistent numbers of samples: [150, 100]",
    );
    expect(n.facts).toEqual([{ label: "Lengths", value: "150, 100" }]);
    expect(
      run(
        "ValueError: Expected 2D array, got 1D array instead:\narray=[1. 2. 3.].\nReshape your data either using array.reshape(-1, 1) if your data has a single feature or array.reshape(1, -1) if it contains a single sample.",
      ).todo?.[0],
    ).toContain("X.reshape(-1, 1)");
  });

  it("reshape and view", () => {
    expect(run("ValueError: cannot reshape array of size 12 into shape (5,3)").title).toBe(
      "12 values cannot be arranged into shape (5, 3)",
    );
    expect(run("RuntimeError: shape '[5, 3]' is invalid for input of size 12").title).toBe(
      "12 values cannot be viewed as shape (5, 3)",
    );
  });

  it("convolution input dimensions and channels", () => {
    const dims = run(
      "RuntimeError: Expected 3D (unbatched) or 4D (batched) input to conv2d, but got input of size: [28, 28]",
    );
    expect(dims.title).toBe("A convolution layer needs a 4D input but got shape (28, 28)");
    const old = run(
      "RuntimeError: Expected 4-dimensional input for 4-dimensional weight [16, 3, 3, 3], but got 3-dimensional input of size [3, 28, 28] instead",
    );
    expect(old.facts).toEqual([{ label: "Input", value: "(3, 28, 28)" }]);
    const ch = run(
      "RuntimeError: Given groups=1, weight of size [16, 3, 3, 3], expected input[32, 1, 28, 28] to have 3 channels, but got 1 channels instead",
    );
    expect(ch.title).toBe("The first convolution expects 3 channels but the images have 1");
    expect(ch.todo?.[0]).toContain("in_channels=1");
  });
});

describe("device mismatch and conversions", () => {
  it("two devices", () => {
    const ex = run(
      "RuntimeError: Expected all tensors to be on the same device, but found at least two devices, cuda:0 and cpu!",
    );
    expect(ex.id).toBe("device-mismatch");
    expect(ex.facts).toEqual([
      { label: "One tensor is on", value: "cuda:0" },
      { label: "Another is on", value: "cpu" },
    ]);
    expect(ex.todo?.[0]).toContain(".to(device)");
    expect(
      run(
        "RuntimeError: Expected all tensors to be on the same device, but found at least two devices, mps:0 and cpu!",
      ).facts?.[0]?.value,
    ).toBe("mps:0");
  });

  it("input type against weight type", () => {
    const ex = run(
      "RuntimeError: Input type (torch.FloatTensor) and weight type (torch.cuda.FloatTensor) should be the same or input should be a MKLDNN tensor and weight is a dense tensor",
    );
    expect(ex.facts).toEqual([
      { label: "Input data", value: "torch.FloatTensor, on the CPU" },
      { label: "Model weights", value: "torch.cuda.FloatTensor, on the GPU (cuda)" },
    ]);
  });

  it("numpy conversions and a CPU-only torch", () => {
    expect(
      run(
        "TypeError: can't convert cuda:0 device type tensor to numpy. Use Tensor.cpu() to copy the tensor to host memory first.",
      ).todo?.[0],
    ).toContain("x.cpu().numpy()");
    expect(
      run(
        "RuntimeError: Can't call numpy() on Tensor that requires grad. Use tensor.detach().numpy() instead.",
      ).todo?.[0],
    ).toContain("x.detach().numpy()");
    expect(run("AssertionError: Torch not compiled with CUDA enabled").title).toContain(
      "no GPU support",
    );
  });
});

describe("dtype mismatch", () => {
  it("labels that should be Long", () => {
    const ex = run("RuntimeError: expected scalar type Long but found Float");
    expect(ex.id).toBe("dtype-mismatch");
    expect(ex.title).toBe("The class labels are floats, but they must be integers");
    expect(ex.facts).toEqual([
      { label: "Expected", value: "Long" },
      { label: "Found", value: "Float" },
    ]);
    expect(ex.todo?.[0]).toContain("labels.long()");
    expect(
      run(
        "RuntimeError: \"nll_loss_forward_reduce_cuda_kernel_2d_index\" not implemented for 'Float'",
      ).title,
    ).toContain("class labels are floats");
  });

  it("inputs that should be Float, and Double from numpy", () => {
    expect(run("RuntimeError: Found dtype Long but expected Float").title).toBe(
      "The inputs are integers, but the model works in floats",
    );
    expect(run("RuntimeError: expected scalar type Float but found Double").todo?.[0]).toContain(
      "float64",
    );
    expect(
      run("RuntimeError: \"log_softmax_lastdim_kernel_impl\" not implemented for 'Long'").title,
    ).toBe("The inputs are integers, but the model works in floats");
  });

  it("class probabilities by shape", () => {
    const ex = run(
      "RuntimeError: Expected floating point type for target with class probabilities, got Long",
    );
    expect(ex.title).toContain("took the labels for probabilities");
    expect(ex.todo?.[0]).toContain("(batch,)");
  });

  it("numpy casting and text in arrays", () => {
    const cast = run(
      "UFuncTypeError: Cannot cast ufunc 'add' output from dtype('float64') to dtype('int64') with casting rule 'same_kind'",
    );
    expect(cast.title).toContain("in-place operation");
    const text = run(
      "UFuncTypeError: ufunc 'add' did not contain a loop with signature matching types (dtype('<U21'), dtype('int64')) -> None",
    );
    expect(text.title).toBe("An array holds text where numbers were expected");
    expect(
      run(
        "TypeError: can't convert np.ndarray of type numpy.object_. The only supported types are: float64, float32, float16, complex64, complex128, int64, int32, int16, int8, uint8, and bool.",
      ).title,
    ).toContain("mixes types");
  });
});

describe("out of memory", () => {
  it("CUDA, with the numbers from the message", () => {
    const ex = run(
      "torch.cuda.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB. GPU 0 has a total capacity of 7.79 GiB of which 1.20 GiB is free. Including non-PyTorch memory, this process has 6.50 GiB memory in use. Of the allocated memory 5.90 GiB is allocated by PyTorch, and 0.30 GiB is reserved by PyTorch but unallocated.",
    );
    expect(ex.id).toBe("out-of-memory");
    expect(ex.title).toBe("The GPU ran out of memory");
    expect(ex.facts).toEqual([
      { label: "Tried to allocate", value: "2.00 GiB" },
      { label: "GPU memory", value: "7.79 GiB" },
      { label: "Free", value: "1.20 GiB" },
      { label: "This process uses", value: "6.50 GiB" },
    ]);
    expect(ex.todo?.[0]).toContain("batch size");
    expect(
      run("RuntimeError: CUDA out of memory. Tried to allocate 512.00 MiB").facts?.[0]?.value,
    ).toBe("512.00 MiB");
  });

  it("MPS and plain RAM", () => {
    const mps = run(
      "RuntimeError: MPS backend out of memory (MPS allocated: 8.00 GB, other allocations: 1.20 GB, max allowed: 9.07 GB). Tried to allocate 512.00 MB on private pool. Use PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 to disable upper limit for memory allocations (may cause system failure).",
    );
    expect(mps.facts).toEqual([
      { label: "Allocated", value: "8.00 GB" },
      { label: "Limit", value: "9.07 GB" },
      { label: "Tried to allocate", value: "512.00 MB" },
    ]);
    expect(run("MemoryError").title).toBe("The program needed more memory than the computer has");
    expect(
      run(
        "RuntimeError: [enforce fail at alloc_cpu.cpp:114] . DefaultCPUAllocator: not enough memory: you tried to allocate 3221225472 bytes.",
      ).facts,
    ).toEqual([{ label: "Tried to allocate", value: "3.00 GiB" }]);
  });
});
