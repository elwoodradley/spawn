/**
 * One sample of every payload kind, for integration checks from the console:
 *   import { samples } from "./output/rich/samples"; output.appendRich(samples.table, 1)
 */
import type { DisplayPayload } from "../../pool/protocol";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR4nGP8z8Dwn4EIwESMolEFdFQAAOr+AwBk9m4xAAAAAElFTkSuQmCC";

const preview: number[][] = Array.from({ length: 16 }, (_, r) =>
  Array.from({ length: 16 }, (_, c) => Math.sin(r / 3) * Math.cos(c / 3)),
);

export const samples: Record<DisplayPayload["kind"], DisplayPayload> = {
  text: { kind: "text", text: "array([0.1, 0.2, 0.3])" },
  figure: {
    kind: "figure",
    format: "png",
    data: TINY_PNG,
    width: 8,
    height: 8,
    title: "tiny",
  },
  table: {
    kind: "table",
    ref: "sample-table",
    source: "pandas",
    shape: [3, 4],
    columns: [
      { name: "x1", dtype: "float64", nulls: 0, stats: { min: -1, max: 1, mean: 0, std: 0.7 } },
      { name: "label", dtype: "int64", nulls: 0, stats: { min: 0, max: 1, mean: 0.5, std: 0.5 } },
      { name: "split", dtype: "object", nulls: 0, stats: null },
      {
        name: "weight",
        dtype: "float64",
        nulls: 1,
        stats: { min: 0.2, max: 1.9, mean: 1, std: 0.6 },
      },
    ],
    index: [0, 1, 2],
    rows: [
      [0.12, 0, "train", 0.5],
      [-0.98, 1, "val", null],
      [0.44, 1, "train", 1.9],
    ],
    rowStart: 0,
  },
  array: {
    kind: "array",
    library: "numpy",
    shape: [3, 64, 64],
    dtype: "float64",
    device: null,
    requiresGrad: null,
    stats: { min: -1, max: 1, mean: 0.01, std: 0.5, nans: 0 },
    preview,
    previewAxes: [1, 2],
  },
  matrix: {
    kind: "matrix",
    role: "confusion",
    ref: "sample-matrix",
    labels: ["cat", "dog", "frog"],
    values: [
      [42, 3, 1],
      [5, 37, 4],
      [0, 2, 48],
    ],
    rowTotals: [46, 46, 50],
    colTotals: [47, 42, 53],
    perClass: [
      { precision: 42 / 47, recall: 42 / 46, f1: 0.903, support: 46 },
      { precision: 37 / 42, recall: 37 / 46, f1: 0.841, support: 46 },
      { precision: 48 / 53, recall: 48 / 50, f1: 0.932, support: 50 },
    ],
    samples: true,
  },
  images: {
    kind: "images",
    library: "numpy",
    count: 6,
    shape: [6, 3, 8, 8],
    layout: "NCHW",
    dtype: "float32",
    thumbs: Array.from({ length: 6 }, () => TINY_PNG),
    thumbSize: [8, 8],
    valueRange: [-2.1, 2.4],
    normalized: true,
  },
  html: { kind: "html", html: "<b>hello</b> from <i>_repr_html_</i>" },
  error: {
    kind: "error",
    type: "ValueError",
    message: "shapes (3,4) and (5,6) not aligned",
    traceback:
      'Traceback (most recent call last):\n  File "/tmp/x.py", line 9, in <module>\n    outer()\n  File "/tmp/x.py", line 6, in outer\n    return inner(a, b)\nValueError: shapes (3,4) and (5,6) not aligned',
  },
};
