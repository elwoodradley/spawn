/**
 * torch and numpy errors other than shapes: tensors on different devices,
 * conversions to numpy, wrong dtypes, and running out of memory. Pure, like
 * `library.ts`; the shape rules are in `shapes.ts`.
 */
import { define, g } from "./entry";
import type { Fact } from "./types";

// 3. Device mismatch ---------------------------------------------------------

interface Devices {
  facts: Fact[];
  detail: string;
}

function deviceOf(tensorType: string): string {
  return /cuda/.test(tensorType)
    ? "the GPU (cuda)"
    : /mps/.test(tensorType)
      ? "the GPU (mps)"
      : "the CPU";
}

const deviceMismatch = define<Devices>({
  id: "device-mismatch",
  matches(type, message) {
    if (!/Error$/.test(type)) return null;
    const two =
      /Expected all tensors to be on the same device, but found at least two devices, (\S+?) and (\S+?)!/.exec(
        message,
      );
    if (two) {
      return {
        facts: [
          { label: "One tensor is on", value: g(two, 1) },
          { label: "Another is on", value: g(two, 2) },
        ],
        detail:
          "Usually the model was moved with .to(device) and a batch was not, or the other way round.",
      };
    }
    const types = /Input type \((\S+)\) and weight type \((\S+)\) should be the same/.exec(message);
    if (types) {
      return {
        facts: [
          { label: "Input data", value: `${g(types, 1)}, on ${deviceOf(g(types, 1))}` },
          { label: "Model weights", value: `${g(types, 2)}, on ${deviceOf(g(types, 2))}` },
        ],
        detail: "The layer's weights and the data given to it are on different devices.",
      };
    }
    return null;
  },
  describe: ({ facts, detail }) => ({
    id: "device-mismatch",
    title: "The model and the data are not on the same device",
    body: [`A tensor on the GPU cannot be combined with one on the CPU. ${detail}`],
    facts,
    todo: [
      "Pick one device at the top, device = 'cuda' if torch.cuda.is_available() else 'cpu', then apply .to(device) to the model once and to every batch (inputs and labels) inside the loop.",
    ],
  }),
});

const tensorConversion = define<"cpu" | "detach" | "no-cuda">({
  id: "tensor-conversion",
  matches(type, message) {
    if (/can't convert (?:cuda|mps).* device type tensor to numpy/.test(message)) return "cpu";
    if (/Can't call numpy\(\) on Tensor that requires grad/.test(message)) return "detach";
    if (type === "AssertionError" && /Torch not compiled with CUDA enabled/.test(message))
      return "no-cuda";
    return null;
  },
  describe: (which) =>
    which === "no-cuda"
      ? {
          id: "tensor-conversion",
          title: "This torch install has no GPU support, but the code asked for cuda",
          body: [
            "The installed torch is the CPU-only build (or this machine has no NVIDIA GPU), so 'cuda' is not a device it knows.",
          ],
          todo: [
            "Use device = 'cuda' if torch.cuda.is_available() else 'cpu' and the code runs on whatever is there.",
          ],
        }
      : {
          id: "tensor-conversion",
          title:
            which === "cpu"
              ? "A GPU tensor was handed to numpy"
              : "A tensor that still tracks gradients was handed to numpy",
          body: [
            which === "cpu"
              ? "numpy only works with memory on the CPU, so a tensor on the GPU must be copied back first."
              : "numpy cannot follow autograd, so the tensor must be cut loose from the graph first.",
          ],
          todo: [
            `Use ${which === "cpu" ? "x.cpu().numpy()" : "x.detach().numpy()"}; for plotting after training, x.detach().cpu().numpy() covers both.`,
          ],
        },
});

// 4. dtype mismatch ----------------------------------------------------------

interface Dtype {
  facts: Fact[];
  title: string;
  fix: string;
}

const FLOATS = new Set(["Float", "Double", "Half", "BFloat16", "float", "float32", "float64"]);
const INTS = new Set(["Long", "Int", "Short", "Byte", "long", "int64", "int32"]);

function dtypePair(expected: string, found: string): Dtype {
  const facts = [
    { label: "Expected", value: expected },
    { label: "Found", value: found },
  ];
  if (INTS.has(expected) && FLOATS.has(found)) {
    return {
      facts,
      title: "The class labels are floats, but they must be integers",
      fix: "Class labels for cross_entropy / nll_loss are a 1-D tensor of whole numbers: use labels.long().",
    };
  }
  if (FLOATS.has(expected) && INTS.has(found)) {
    return {
      facts,
      title: "The inputs are integers, but the model works in floats",
      fix: "Convert the data once: x.float(), or torch.tensor(data, dtype=torch.float32). For a regression loss the targets need .float() too.",
    };
  }
  if (expected === "Float" && found === "Double") {
    return {
      facts,
      title: "The data is 64-bit (Double) but the model is 32-bit (Float)",
      fix: "numpy arrays are float64 by default; use torch.tensor(a, dtype=torch.float32) or x.float() when converting.",
    };
  }
  return {
    facts,
    title: `A ${found} tensor was given where ${expected} was expected`,
    fix: "Make both sides the same dtype with .float(), .long() or .to(other.dtype).",
  };
}

const dtypeMismatch = define<Dtype>({
  id: "dtype-mismatch",
  matches(type, message) {
    if (!/Error$/.test(type)) return null;
    const a = /expected scalar type (\w+) but found (\w+)/.exec(message);
    if (a) return dtypePair(g(a, 1), g(a, 2));
    const b = /Found dtype (\w+) but expected (\w+)/.exec(message);
    if (b) return dtypePair(g(b, 2), g(b, 1));
    const c = /"?(\w+)"? not implemented for '(\w+)'/.exec(message);
    if (c) {
      const kernel = g(c, 1);
      const found = g(c, 2);
      const expected = /nll_loss|cross_entropy|index|gather|embedding/.test(kernel)
        ? "Long"
        : "Float";
      return dtypePair(expected, found);
    }
    if (
      /Expected floating point type for target with class probabilities, got (\w+)/.test(message)
    ) {
      return {
        facts: [{ label: "Labels", value: "same shape as the predictions" }],
        title: "cross_entropy took the labels for probabilities because of their shape",
        fix: "Class labels should be a 1-D tensor of integers, shape (batch,), one class index per example, not one-hot rows. Use labels.argmax(1) if they are one-hot, or drop the extra dimension with labels.squeeze(1).",
      };
    }
    const d = /Cannot cast ufunc '(\w+)' output from dtype\('([^']+)'\) to dtype\('([^']+)'\)/.exec(
      message,
    );
    if (d) {
      return {
        facts: [
          { label: "Result", value: g(d, 2) },
          { label: "Array", value: g(d, 3) },
        ],
        title: "An in-place operation would put decimals into an integer array",
        fix: `The array is ${g(d, 3)} and the result of ${g(d, 1)} is ${g(d, 2)}. Create the array as float (np.zeros(n, dtype=float) or .astype(float)) or use a = a + b instead of a += b.`,
      };
    }
    const e = /ufunc '(\w+)' did not contain a loop with signature matching types \((.+?)\)/.exec(
      message,
    );
    if (e) {
      const text = /U\d+|<U|object|str/.test(g(e, 2));
      return {
        facts: [{ label: "Types", value: g(e, 2) }],
        title: text
          ? "An array holds text where numbers were expected"
          : `numpy cannot ${g(e, 1)} these two types`,
        fix: text
          ? "dtype '<U..' means strings. The column was read as text (a header row, a comma as decimal separator, a missing value marker); convert with .astype(float) or pd.to_numeric(col, errors='coerce')."
          : "Convert both arrays to the same numeric dtype with .astype(float).",
      };
    }
    if (/can't convert np\.ndarray of type numpy\.object_/.test(message)) {
      return {
        facts: [{ label: "Array dtype", value: "object" }],
        title: "The array mixes types, so torch cannot turn it into a tensor",
        fix: "An object array usually holds strings or lists of unequal length. Make it a plain numeric array first: np.array(x, dtype=np.float32).",
      };
    }
    return null;
  },
  describe: ({ facts, title, fix }) => ({
    id: "dtype-mismatch",
    title,
    body: [
      "Every element of a tensor has one number type (dtype), and the two sides of this operation do not agree.",
    ],
    facts,
    todo: [fix],
  }),
});

// 11. Out of memory ----------------------------------------------------------

interface Memory {
  where: "GPU" | "MPS" | "RAM";
  facts: Fact[];
}

const outOfMemory = define<Memory>({
  id: "out-of-memory",
  matches(type, message) {
    if (/OutOfMemoryError$/.test(type) || /CUDA out of memory/.test(message)) {
      const facts: Fact[] = [];
      const tried = /Tried to allocate (\S+ [GM]iB)/.exec(message);
      if (tried) facts.push({ label: "Tried to allocate", value: g(tried, 1) });
      const total = /total capacity of (\S+ [GM]iB) of which (\S+ [GM]iB) is free/.exec(message);
      if (total) {
        facts.push({ label: "GPU memory", value: g(total, 1) });
        facts.push({ label: "Free", value: g(total, 2) });
      }
      const used = /this process has (\S+ [GM]iB) memory in use/.exec(message);
      if (used) facts.push({ label: "This process uses", value: g(used, 1) });
      return { where: "GPU", facts };
    }
    const mps =
      /MPS backend out of memory \(MPS allocated: ([^,]+), other allocations: ([^,]+), max allowed: ([^)]+)\)(?:\. Tried to allocate (\S+ [GMK]B))?/.exec(
        message,
      );
    if (mps) {
      const facts: Fact[] = [
        { label: "Allocated", value: g(mps, 1) },
        { label: "Limit", value: g(mps, 3) },
      ];
      if (mps[4]) facts.push({ label: "Tried to allocate", value: mps[4] });
      return { where: "MPS", facts };
    }
    if (type === "MemoryError" || /DefaultCPUAllocator: not enough memory/.test(message)) {
      const bytes = /tried to allocate (\d+) bytes/.exec(message);
      const facts = bytes
        ? [
            {
              label: "Tried to allocate",
              value: `${(Number(g(bytes, 1)) / 1024 ** 3).toFixed(2)} GiB`,
            },
          ]
        : [];
      return { where: "RAM", facts };
    }
    return null;
  },
  describe: ({ where, facts }) => ({
    id: "out-of-memory",
    title:
      where === "RAM"
        ? "The program needed more memory than the computer has"
        : "The GPU ran out of memory",
    body: [
      where === "RAM"
        ? "Everything a program holds at once (the dataset, copies made by slicing, model activations) must fit in RAM."
        : "Everything a training step holds at once (weights, one batch, every activation kept for backward) must fit in GPU memory. A previous run in the Interactive Console may still be holding its share.",
    ],
    facts,
    todo:
      where === "RAM"
        ? [
            "Load less at a time (chunks, a DataLoader), use float32 instead of float64, and delete arrays you no longer need.",
          ]
        : [
            "Halve the batch size (the most reliable fix), then try a smaller model or image size.",
            "Wrap evaluation in with torch.no_grad(); it stops activations being kept.",
            "Free the previous run: del model, optimizer; torch.cuda.empty_cache(), or restart the Interactive Console.",
          ],
  }),
});

export { deviceMismatch, dtypeMismatch, outOfMemory, tensorConversion };
