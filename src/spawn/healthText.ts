/**
 * The words for the training health check. Every message must make sense to
 * someone in their first ML course without a search: it says what the curve
 * did, where, and the one most common reason. "Likely" findings state it;
 * "possible" ones say "may".
 */
import type { XUnit } from "./metrics";
import { classify } from "./pairs";

export type Confidence = "likely" | "possible";

/** "Training loss", "Validation accuracy", "Loss", "Validation f1". */
export function describeSeries(name: string): string {
  const { side, metric } = classify(name);
  const word = /^(loss|nll|cost)$/i.test(metric)
    ? "loss"
    : /^(acc|accuracy)$/i.test(metric) || /[_/.-](acc|accuracy)$/i.test(metric)
      ? "accuracy"
      : metric;
  const prefix = side === "train" ? "Training " : side === "val" ? "Validation " : "";
  const text = `${prefix}${word}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The same, for a chart's metric rather than one series: "loss", "accuracy". */
export function metricWord(metric: string): string {
  return describeSeries(metric).toLowerCase();
}

export function at(unit: XUnit, step: number): string {
  return `at ${unit} ${step}`;
}

export function span(unit: XUnit, count: number): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** Three significant digits, no exponent noise for ordinary losses. */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 1e-3) return String(Number(value.toPrecision(3)));
  return value.toExponential(1);
}

export function overfittingMessage(
  metric: string,
  unit: XUnit,
  bestStep: number,
  confidence: Confidence,
): string {
  const m = metricWord(metric);
  if (confidence === "likely") {
    return (
      `Validation ${m} started rising ${at(unit, bestStep)} while training ${m} kept falling. ` +
      `The model started memorizing instead of learning. The best version was ${at(unit, bestStep)}.`
    );
  }
  return (
    `Validation ${m} may have started rising ${at(unit, bestStep)} while training ${m} kept falling. ` +
    `This can mean the model is memorizing instead of learning. The best version so far was ${at(unit, bestStep)}.`
  );
}

export function nonFiniteMessage(
  name: string,
  kind: "nan" | "inf",
  unit: XUnit,
  step: number,
): string {
  const what = kind === "nan" ? "NaN (not a number)" : "infinite";
  const who = describeSeries(name);
  const lossLike = /loss|nll|cost/i.test(name);
  const why = lossLike
    ? "The learning rate is probably too high."
    : "Check for a division by zero or NaN values in the data.";
  return `${who} became ${what} ${at(unit, step)}. ${why}`;
}

export function explodingMessage(
  name: string,
  unit: XUnit,
  step: number,
  from: number,
  to: number,
): string {
  const who = describeSeries(name);
  const factor = from > 0 ? Math.round(to / from) : 0;
  return (
    `${who} is exploding: it went from ${fmt(from)} to ${fmt(to)} starting ${at(unit, step)}` +
    `${factor > 0 ? ` (${factor}× its lowest value)` : ""}. The learning rate is probably too high.`
  );
}

export function stalledMessage(
  name: string,
  unit: XUnit,
  count: number,
  from: number,
  to: number,
  confidence: Confidence,
): string {
  const who = describeSeries(name);
  const verb = confidence === "likely" ? "hasn't" : "has barely";
  return (
    `${who} ${verb} meaningfully improved in ${span(unit, count)} (${fmt(from)} → ${fmt(to)}). ` +
    `It may have finished learning (converged); if it is still too high, the learning rate may be too small.`
  );
}

export function flatMessage(name: string, value: number, unit: XUnit, count: number): string {
  const who = describeSeries(name);
  return (
    `${who} has stayed at exactly ${fmt(value)} for ${span(unit, count)}. ` +
    `The model may not be training at all: check that the optimizer step runs every batch and that the parameters have requires_grad set.`
  );
}

export function gapMessage(metric: string, train: number, val: number): string {
  const m = metricWord(metric);
  return (
    `Training ${m} is ${fmt(train)} but validation ${m} is ${fmt(val)}. ` +
    `The model may be overfitting, or the validation set may differ from the training data.`
  );
}
