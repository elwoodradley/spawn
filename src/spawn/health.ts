/**
 * A check-engine light for training. Reads the metric series the Metrics
 * panel already parses and says, in plain words, what the curves show:
 * overfitting, a loss that became NaN or exploded, a loss that stalled or
 * never moved, a large train/val gap. Pure: no Solid, no DOM.
 *
 * Every check is O(n) per series and tuned to stay quiet, because a false
 * alarm costs more trust than a missed one: each needs enough points, a
 * change well above the noise, and says "may" when it is not sure.
 */
import {
  explodingMessage,
  flatMessage,
  gapMessage,
  nonFiniteMessage,
  overfittingMessage,
  stalledMessage,
  type Confidence,
} from "./healthText";
import { argmin, indexAtStep, mean, noiseLevel, smooth, values, windowFor } from "./healthMath";
import type { NonFinite, Series, XUnit } from "./metrics";
import { classify, groupLines, groupSeries, type ChartGroup } from "./pairs";

export type { Confidence } from "./healthText";
export type FindingKind = "overfitting" | "nan" | "inf" | "exploding" | "stalled" | "flat" | "gap";
export type Severity = "warn" | "info";

export interface Finding {
  /** Stable across recomputes, so a dismissal survives the run streaming on. */
  id: string;
  /** The chart it belongs to: the group's metric name (`loss` for `val_loss`). */
  metric: string;
  /** The series the marker points at. */
  series: string;
  kind: FindingKind;
  severity: Severity;
  step: number;
  message: string;
  confidence: Confidence;
  /** Short text beside the chart marker. */
  label: string;
}

export interface HealthInput {
  series: readonly Series[];
  nonFinite?: readonly NonFinite[];
  xUnit?: XUnit;
}

export const THRESHOLDS = {
  overfit: { minPoints: 10, minTail: 5, minRise: 0.1, likelyRise: 0.2, noiseMultiple: 3 },
  exploding: { minPoints: 10, factor: 10, sustained: 5, floor: 1e-3 },
  stalled: { minPoints: 40, maxChange: 0.01, likelyChange: 0.002 },
  flat: { minPoints: 10 },
  gap: { minPoints: 10, window: 5, minGap: 0.25 },
} as const;

const LOSS_LIKE = /loss|nll|cost|error|err$/i;
const BOUNDED = /acc|accuracy|precision|recall|f1|auc|iou|dice/i;
const ORDER: Record<FindingKind, number> = {
  nan: 0,
  inf: 0,
  exploding: 1,
  overfitting: 2,
  flat: 3,
  gap: 4,
  stalled: 5,
};

export function analyzeHealth(input: HealthInput): Finding[] {
  const unit = input.xUnit ?? "sample";
  const out: Finding[] = [];
  for (const group of groupSeries(input.series)) {
    if (LOSS_LIKE.test(group.metric)) {
      const over = overfitting(group, unit);
      if (over) out.push(over);
      for (const s of groupLines(group)) {
        const flatFinding = flat(group.metric, s, unit);
        if (flatFinding) {
          out.push(flatFinding);
          continue;
        }
        if (classify(s.name).side === "val") continue;
        const blown = exploding(group.metric, s, unit);
        if (blown) out.push(blown);
        else {
          const stuck = stalled(group.metric, s, unit);
          if (stuck) out.push(stuck);
        }
      }
    } else if (BOUNDED.test(group.metric)) {
      const wide = gap(group);
      if (wide) out.push(wide);
    }
  }
  out.push(...nonFinite(input.nonFinite ?? [], unit));
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/**
 * Validation loss climbs back up from its minimum while training loss keeps
 * falling. Both curves are smoothed; the rise must be ≥10% of the minimum,
 * ≥3× the noise level, and established over the last five points.
 */
function overfitting(group: ChartGroup, unit: XUnit): Finding | null {
  const T = THRESHOLDS.overfit;
  const { train, val } = group;
  if (!train || !val) return null;
  const v = values(val.points);
  const n = v.length;
  if (n < T.minPoints || train.points.length < 3) return null;
  const s = smooth(v, windowFor(n));
  const m = argmin(s);
  const tail = n - 1 - m;
  const best = s[m] ?? 0;
  const last = s[n - 1] ?? 0;
  const rise = last - best;
  if (m < 2 || tail < T.minTail || !(best > 0)) return null;
  const sigma = noiseLevel(v.slice(n >> 1));
  if (rise < T.minRise * best || rise < T.noiseMultiple * sigma) return null;
  for (let i = n - T.minTail; i < n; i++) if ((s[i] ?? 0) - best < rise / 2) return null;
  const bestStep = val.points[m]?.step ?? 0;
  const t = smooth(values(train.points), windowFor(train.points.length));
  const tBest = t[indexAtStep(train.points, bestStep)] ?? 0;
  const tLast = t[t.length - 1] ?? 0;
  if (!(tBest > 0) || tBest - tLast < 0.02 * tBest) return null;
  const likely = rise >= T.likelyRise * best && rise >= 2 * T.noiseMultiple * sigma && tail >= 8;
  const confidence: Confidence = likely ? "likely" : "possible";
  return {
    id: `overfitting:${val.name}`,
    metric: group.metric,
    series: val.name,
    kind: "overfitting",
    severity: "warn",
    step: bestStep,
    message: overfittingMessage(group.metric, unit, bestStep, confidence),
    confidence,
    label: "val rising",
  };
}

/**
 * Five consecutive points at ≥10× the running minimum, still there at the
 * end. The minimum is taken on the smoothed curve so one lucky batch with a
 * tiny loss cannot make every normal point after it look like a blow-up.
 */
function exploding(metric: string, s: Series, unit: XUnit): Finding | null {
  const T = THRESHOLDS.exploding;
  const pts = s.points;
  if (pts.length < T.minPoints) return null;
  const raw = values(pts);
  const sm = smooth(raw, windowFor(raw.length));
  let runMin = Number.POSITIVE_INFINITY;
  let run = 0;
  let start = 0;
  let ref = 0;
  for (let i = 0; i < sm.length; i++) {
    const v = sm[i] ?? 0;
    if (i > 0 && v >= T.factor * Math.max(runMin, T.floor)) {
      if (run === 0) {
        start = i;
        ref = runMin;
      }
      run += 1;
    } else run = 0;
    if (v < runMin) runMin = v;
    if (runMin <= 0) return null;
  }
  if (run < T.sustained) return null;
  // Smoothing lags the blow-up by half a window; the marker goes on the first raw point of it.
  while (start > 1 && (raw[start - 1] ?? 0) >= T.factor * Math.max(ref, T.floor)) start -= 1;
  const step = pts[start]?.step ?? 0;
  const to = pts[pts.length - 1]?.value ?? 0;
  return {
    id: `exploding:${s.name}`,
    metric,
    series: s.name,
    kind: "exploding",
    severity: "warn",
    step,
    message: explodingMessage(s.name, unit, step, ref, to),
    confidence: "likely",
    label: "exploding",
  };
}

/** The trailing half of a long run changed by less than 1%. */
function stalled(metric: string, s: Series, unit: XUnit): Finding | null {
  const T = THRESHOLDS.stalled;
  const pts = s.points;
  const n = pts.length;
  if (n < T.minPoints) return null;
  const half = n >> 1;
  const w = Math.max(3, Math.floor(n / 8));
  const from = mean(values(pts.slice(half, half + w)));
  const to = mean(values(pts.slice(n - w)));
  if (!(Math.abs(from) > 0)) return null;
  const change = Math.abs(from - to) / Math.abs(from);
  if (change >= T.maxChange) return null;
  const startStep = pts[half]?.step ?? 0;
  const count = (pts[n - 1]?.step ?? 0) - startStep;
  const confidence: Confidence = change < T.likelyChange ? "likely" : "possible";
  return {
    id: `stalled:${s.name}`,
    metric,
    series: s.name,
    kind: "stalled",
    severity: "info",
    step: startStep,
    message: stalledMessage(s.name, unit, count, from, to, confidence),
    confidence,
    label: "no change",
  };
}

/** Exactly the same value from the first point on: nothing is being trained. */
function flat(metric: string, s: Series, unit: XUnit): Finding | null {
  const pts = s.points;
  if (pts.length < THRESHOLDS.flat.minPoints) return null;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    lo = Math.min(lo, p.value);
    hi = Math.max(hi, p.value);
  }
  if (hi - lo > 1e-9 * Math.max(1, Math.abs(hi))) return null;
  const first = pts[0]?.step ?? 0;
  const count = (pts[pts.length - 1]?.step ?? 0) - first;
  return {
    id: `flat:${s.name}`,
    metric,
    series: s.name,
    kind: "flat",
    severity: "warn",
    step: first,
    message: flatMessage(s.name, hi, unit, count),
    confidence: "possible",
    label: "flat",
  };
}

/** A bounded metric (accuracy and friends) far higher on train than on val. */
function gap(group: ChartGroup): Finding | null {
  const T = THRESHOLDS.gap;
  const { train, val } = group;
  if (!train || !val) return null;
  if (train.points.length < T.minPoints || val.points.length < T.minPoints) return null;
  const a = mean(values(train.points.slice(-T.window)));
  const b = mean(values(val.points.slice(-T.window)));
  // Percentages (99.0 vs 60.0) get the same threshold scaled up.
  const scale = Math.max(a, b) > 1.5 ? 100 : 1;
  if (a - b < T.minGap * scale) return null;
  const step = val.points[val.points.length - 1]?.step ?? 0;
  return {
    id: `gap:${val.name}`,
    metric: group.metric,
    series: val.name,
    kind: "gap",
    severity: "warn",
    step,
    message: gapMessage(group.metric, a, b),
    confidence: "possible",
    label: `gap ${scale === 1 ? (a - b).toFixed(2) : `${(a - b).toFixed(0)}%`}`,
  };
}

/** The first `nan` or `inf` per series. */
function nonFinite(events: readonly NonFinite[], unit: XUnit): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const e of events) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    out.push({
      id: `${e.kind}:${e.name}`,
      metric: classify(e.name).metric,
      series: e.name,
      kind: e.kind,
      severity: "warn",
      step: e.step,
      message: nonFiniteMessage(e.name, e.kind, unit, e.step),
      confidence: "likely",
      label: e.kind === "nan" ? "NaN" : "inf",
    });
  }
  return out;
}
