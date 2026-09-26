/**
 * What the pool (the persistent kernel) can say to the frontend, and what the
 * frontend can ask. This is SPAWN's own display schema, independent of how
 * the kernel is transported: every rich renderer consumes these payloads and
 * nothing else, so the kernel implementation can change underneath.
 *
 * Sizes are bounded at the source: tables come in pages, arrays come with a
 * small 2D preview for the heatmap, figures are already rasterised or SVG.
 */

export interface ColumnInfo {
  name: string;
  dtype: string;
  nulls: number;
  /** Numeric columns only. */
  stats: { min: number; max: number; mean: number; std: number } | null;
}

export type Cell = string | number | boolean | null;

export type DisplayPayload =
  /** The repr of a bare expression, or explicit text output. */
  | { kind: "text"; text: string }
  /** A rendered figure. `data` is base64 for png, raw markup for svg. */
  | {
      kind: "figure";
      format: "png" | "svg";
      data: string;
      width: number;
      height: number;
      title: string | null;
    }
  /** One page of a DataFrame-like value. */
  | {
      kind: "table";
      /** Stable id so the frontend can request more rows. */
      ref: string;
      source: "pandas" | "polars" | "other";
      shape: [number, number];
      columns: ColumnInfo[];
      index: Cell[];
      rows: Cell[][];
      rowStart: number;
    }
  /** An array or tensor summary with a downsampled 2D preview. */
  | {
      kind: "array";
      library: "numpy" | "torch" | "jax" | "other";
      shape: number[];
      dtype: string;
      device: string | null;
      requiresGrad: boolean | null;
      stats: { min: number; max: number; mean: number; std: number; nans: number } | null;
      /** Up to 32x32 values sampled from the first two significant axes. */
      preview: number[][];
      /** Which axes the preview slices, for the label. */
      previewAxes: [number, number] | null;
    }
  /**
   * A square non-negative integer matrix: a confusion matrix. Rows are the
   * true class, columns the predicted one. `samples` says the pool found the
   * label vectors it came from, so `matrixCells` can list the samples per cell.
   */
  | {
      kind: "matrix";
      role: "confusion";
      ref: string;
      labels: string[] | null;
      values: number[][];
      rowTotals: number[];
      colTotals: number[];
      perClass: {
        precision: number | null;
        recall: number | null;
        f1: number | null;
        support: number;
      }[];
      samples: boolean;
    }
  /** A batch of images recognised from its shape, as small PNG thumbnails. */
  | {
      kind: "images";
      library: "numpy" | "torch" | "jax" | "other";
      count: number;
      shape: number[];
      layout: "NCHW" | "NHWC" | "CHW" | "HWC" | "NHW";
      dtype: string;
      /** Base64 PNGs, at most 64. */
      thumbs: string[];
      /** [width, height] of each thumbnail in pixels. */
      thumbSize: [number, number];
      valueRange: [number, number] | null;
      /** True when values were rescaled per image to fit 0..255. */
      normalized: boolean;
    }
  /** Trusted HTML from a library's `_repr_html_`, rendered sandboxed. */
  | { kind: "html"; html: string }
  /** A traceback from the pool; frames link like croaks in the console. */
  | { kind: "error"; type: string; message: string; traceback: string };

/** Something a spawn into the pool produced, in order. */
export interface PoolEvent {
  /** Which exec produced it. */
  exec: number;
  payload: DisplayPayload;
}

export interface ExecRequest {
  code: string;
  /** For tracebacks and the console header. */
  file: string | null;
  /** 1-based first line of `code` within `file`, for traceback line numbers. */
  startLine: number;
  /** What the user spawned: the console labels the block with it. */
  scope: "cell" | "selection" | "file" | "expression";
}

export interface ExecResult {
  exec: number;
  ok: boolean;
  durationMs: number;
}

export interface VariableInfo {
  name: string;
  type: string;
  /** One line: `(400, 2) float64`, `DataFrame 400×5`, `int 7`. */
  summary: string;
  shape: number[] | null;
  dtype: string | null;
  /** Bytes, when cheap to know. */
  size: number | null;
}

export type PoolStatus = "cold" | "starting" | "idle" | "busy" | "croaked";

/**
 * The client the UI talks to. `src/pool/client.ts` holds the live one; until
 * a kernel is wired in it is a stub that reports `cold`.
 */
export interface PoolClient {
  status: () => PoolStatus;
  /** Run code; events stream to the output model, the promise resolves at the end. */
  exec(request: ExecRequest): Promise<ExecResult>;
  /** Evaluate a name or expression without printing side effects; null if unknown. */
  inspect(expression: string): Promise<DisplayPayload | null>;
  variables(): Promise<VariableInfo[]>;
  /** More rows of a table previously shown. */
  tableRows(ref: string, rowStart: number, count: number): Promise<Cell[][]>;
  /** Sample indices that landed in one confusion-matrix cell (true row, predicted col). */
  matrixCells(ref: string, row: number, col: number): Promise<number[]>;
  interrupt(): Promise<void>;
  restart(): Promise<void>;
  shutdown(): Promise<void>;
}
