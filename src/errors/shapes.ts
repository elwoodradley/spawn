/**
 * Shape mismatches from numpy, torch and scikit-learn. The message carries
 * the numbers; each rule puts the two shapes side by side and says which
 * dimension disagrees and what usually causes it. Pure, like `library.ts`.
 */
import { define, g } from "./entry";
import type { Explanation } from "./types";

/** `(3, 4)` from `3,4` or `3, 4`. */
function shape(text: string): string {
  return `(${text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(", ")})`;
}

function dims(text: string): number[] {
  return text
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/** Which axis breaks broadcasting: aligned from the right, 1 stretches. */
export function broadcastConflict(a: number[], b: number[]): string | null {
  for (let i = 1; i <= Math.min(a.length, b.length); i++) {
    const x = a[a.length - i];
    const y = b[b.length - i];
    if (x !== undefined && y !== undefined && x !== y && x !== 1 && y !== 1) {
      return `the last-but-${i - 1} axis: ${x} versus ${y}`.replace("last-but-0", "last");
    }
  }
  return null;
}

// 2. Shape mismatch ----------------------------------------------------------

type Partial = Pick<Explanation, "title" | "body" | "facts" | "todo">;

interface ShapeRule {
  re: RegExp;
  build(m: RegExpExecArray): Partial;
}

const SHAPE_RULES: ShapeRule[] = [
  {
    re: /operands could not be broadcast together with (?:remapped )?shapes \(([^)]*)\) \(([^)]*)\)/,
    build: (m) => {
      const conflict = broadcastConflict(dims(g(m, 1)), dims(g(m, 2)));
      return {
        title: "Two arrays have shapes that cannot be combined element by element",
        body: [
          `numpy lines shapes up from the right; each axis must be equal or 1. Here they differ on ${conflict ?? "at least one axis"}.`,
        ],
        facts: [
          { label: "First", value: shape(g(m, 1)) },
          { label: "Second", value: shape(g(m, 2)) },
        ],
        todo: [
          "Print a.shape and b.shape before this line; a transpose (.T) or reshape usually fixes it.",
        ],
      };
    },
  },
  {
    re: /shapes \(([^)]*)\) and \(([^)]*)\) not aligned: (\d+) \(dim \d+\) != (\d+) \(dim \d+\)/,
    build: (m) => ({
      title: "Matrix multiplication: the inner sizes do not match",
      body: [
        `For A @ B the number of columns of A must equal the number of rows of B. Here that is ${g(m, 3)} against ${g(m, 4)}.`,
      ],
      facts: [
        { label: "A", value: shape(g(m, 1)) },
        { label: "B", value: shape(g(m, 2)) },
      ],
      todo: ["Transpose one operand (.T) or check which axis holds the features."],
    }),
  },
  {
    re: /mat1 and mat2 shapes cannot be multiplied \((\d+)x(\d+) and (\d+)x(\d+)\)/,
    build: (m) => ({
      title: `A Linear layer expected ${g(m, 3)} input features but got ${g(m, 2)}`,
      body: [
        `The input to the layer has shape (${g(m, 1)}, ${g(m, 2)}): ${g(m, 1)} examples with ${g(m, 2)} features each. The layer's weights expect ${g(m, 3)} features (its in_features) and produce ${g(m, 4)}.`,
      ],
      facts: [
        { label: "Input", value: `(${g(m, 1)}, ${g(m, 2)})` },
        { label: "Layer expects", value: `in_features=${g(m, 3)}, out_features=${g(m, 4)}` },
      ],
      todo: [
        `Set in_features=${g(m, 2)} in that nn.Linear, or check the flatten / pooling before it, which decides how many features reach the layer.`,
      ],
    }),
  },
  {
    // The per-parameter lines follow on tab-indented lines the card never sees.
    re: /Error\(s\) in loading state_dict for (\w+)|size mismatch for (\S+): copying a param with shape torch\.Size\(\[([^\]]*)\]\) from checkpoint, the shape in current model is torch\.Size\(\[([^\]]*)\]\)/,
    build: (m) => ({
      title: "The saved weights were made by a different model",
      body: [
        m[1]
          ? `Some parameters of ${m[1]} have a different shape (or name) in the checkpoint than in the model you built. The lines under the traceback list each one.`
          : `The parameter ${g(m, 2)} has a different shape in the checkpoint than in the model you built.`,
      ],
      facts: m[1]
        ? []
        : [
            { label: "Checkpoint", value: shape(g(m, 3)) },
            { label: "Your model", value: shape(g(m, 4)) },
          ],
      todo: [
        "Build the model with exactly the sizes used when it was saved (layer widths, number of classes).",
      ],
    }),
  },
  {
    re: /Expected input batch_size \((\d+)\) to match target batch_size \((\d+)\)/,
    build: (m) => ({
      title: `The loss got predictions for ${g(m, 1)} examples but labels for ${g(m, 2)}`,
      body: [
        "The two tensors given to the loss function must describe the same examples, so their first dimension must agree.",
      ],
      facts: [
        { label: "Predictions", value: `${g(m, 1)} rows` },
        { label: "Labels", value: `${g(m, 2)} rows` },
      ],
      todo: [
        "A view(-1, n) or reshape with the wrong n changes the batch size silently: print x.shape after each step of forward().",
      ],
    }),
  },
  {
    re: /The size of tensor a \((\d+)\) must match the size of tensor b \((\d+)\) at non-singleton dimension (\d+)/,
    build: (m) => ({
      title: `Two tensors disagree on dimension ${g(m, 3)}: ${g(m, 1)} versus ${g(m, 2)}`,
      body: [
        `An element-wise operation (+, -, *, a comparison, a loss) needs equal sizes on every dimension, or a 1 that can be stretched. Dimension ${g(m, 3)} is ${g(m, 1)} on one side and ${g(m, 2)} on the other.`,
      ],
      facts: [
        { label: "Tensor a", value: `${g(m, 1)} on dim ${g(m, 3)}` },
        { label: "Tensor b", value: `${g(m, 2)} on dim ${g(m, 3)}` },
      ],
      todo: [
        "Print both .shape values before this line; unsqueeze, squeeze or a transpose usually fixes it.",
      ],
    }),
  },
  {
    re: /Target size \(torch\.Size\(\[([^\]]*)\]\)\) must be the same as input size \(torch\.Size\(\[([^\]]*)\]\)\)/,
    build: (m) => ({
      title: "The labels and the predictions have different shapes",
      body: [
        "This loss compares the two element by element, so it needs them to be exactly the same shape.",
      ],
      facts: [
        { label: "Predictions", value: shape(g(m, 2)) },
        { label: "Labels", value: shape(g(m, 1)) },
      ],
      todo: [
        "Usually one side has a trailing 1: use labels.unsqueeze(1) or predictions.squeeze(1), and make the labels float.",
      ],
    }),
  },
  {
    re: /X has (\d+) features?, but (\w+) is expecting (\d+) features? as input/,
    build: (m) => ({
      title: `The model was trained on ${g(m, 3)} columns but was given ${g(m, 1)}`,
      body: [
        `${g(m, 2)} learned from data with ${g(m, 3)} features, so predict() and transform() need the same ${g(m, 3)}, in the same order.`,
      ],
      facts: [
        { label: "Given", value: `${g(m, 1)} features` },
        { label: "Expected", value: `${g(m, 3)} features` },
      ],
      todo: [
        "Apply the same column selection and preprocessing to the new data as to the training data.",
      ],
    }),
  },
  {
    re: /Found input variables with inconsistent numbers of samples: \[([^\]]*)\]/,
    build: (m) => ({
      title: "X and y do not have the same number of rows",
      body: ["Every row of X needs exactly one label in y, so the two must be the same length."],
      facts: [{ label: "Lengths", value: g(m, 1) }],
      todo: [
        "Check that X and y come from the same rows (a dropna or a slice applied to only one of them is the usual cause).",
      ],
    }),
  },
  {
    re: /Expected 2D array, got 1D array instead/,
    build: () => ({
      title: "scikit-learn wants a 2D table, even for a single feature",
      body: [
        "X must have the shape (n_samples, n_features). A single column arrives as 1D, shape (n,), which it refuses.",
      ],
      todo: [
        "Use X.reshape(-1, 1) for one feature, or select a list of columns, df[['col']], instead of one, df['col'].",
      ],
    }),
  },
  {
    re: /cannot reshape array of size (\d+) into shape \(([^)]*)\)/,
    build: (m) => ({
      title: `${g(m, 1)} values cannot be arranged into shape ${shape(g(m, 2))}`,
      body: [
        "A reshape must keep the total number of elements; the product of the new shape must equal the old size.",
      ],
      facts: [
        { label: "Elements", value: g(m, 1) },
        { label: "Wanted", value: shape(g(m, 2)) },
      ],
      todo: [
        "Use -1 for one dimension to let numpy work it out, and check where the array came from.",
      ],
    }),
  },
  {
    re: /shape '\[([^\]]*)\]' is invalid for input of size (\d+)/,
    build: (m) => ({
      title: `${g(m, 2)} values cannot be viewed as shape ${shape(g(m, 1))}`,
      body: [
        "view() and reshape() must keep the total number of elements; the product of the new shape must equal the old size.",
      ],
      facts: [
        { label: "Elements", value: g(m, 2) },
        { label: "Wanted", value: shape(g(m, 1)) },
      ],
      todo: ["Use -1 for one dimension, e.g. x.view(x.size(0), -1), and check the input's shape."],
    }),
  },
  {
    re: /Expected (\d)D \(unbatched\) or (\d)D \(batched\) input to (\w+), but got input of size: \[([^\]]*)\]|Expected (\d)-dimensional input for \d-dimensional weight \[[^\]]*\], but got (\d)-dimensional input of size \[([^\]]*)\]/,
    build: (m) => {
      const got = m[4] ?? m[7] ?? "?";
      const want = m[2] ?? m[5] ?? "?";
      return {
        title: `A convolution layer needs a ${want}D input but got shape ${shape(got)}`,
        body: [
          "Conv2d expects (batch, channels, height, width), and Conv1d expects (batch, channels, length). A single image or a grayscale one is missing a dimension.",
        ],
        facts: [{ label: "Input", value: shape(got) }],
        todo: [
          "Add the missing dimension with x.unsqueeze(0) (batch) or x.unsqueeze(1) (channels).",
        ],
      };
    },
  },
  {
    re: /Given groups=\d+, weight of size \[([^\]]*)\], expected input\[([^\]]*)\] to have (\d+) channels, but got (\d+) channels instead/,
    build: (m) => ({
      title: `The first convolution expects ${g(m, 3)} channels but the images have ${g(m, 4)}`,
      body: [
        "in_channels of a Conv2d must equal the channel dimension of its input: 1 for grayscale, 3 for RGB.",
      ],
      facts: [
        { label: "Input", value: shape(g(m, 2)) },
        { label: "Layer expects", value: `${g(m, 3)} channels` },
      ],
      todo: [
        `Set in_channels=${g(m, 4)} in that layer, or convert the images to ${g(m, 3)} channels when loading them.`,
      ],
    }),
  },
];

const shapeMismatch = define<Partial>({
  id: "shape-mismatch",
  matches(type, message) {
    if (!/Error$/.test(type)) return null;
    for (const rule of SHAPE_RULES) {
      const m = rule.re.exec(message);
      if (m) return rule.build(m);
    }
    return null;
  },
  describe: (partial) => ({ id: "shape-mismatch", ...partial }),
});

export { shapeMismatch };
