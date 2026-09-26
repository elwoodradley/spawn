/**
 * Which series deserve a chart. A value printed once or twice is a scalar
 * (`hidden=64`, `accuracy 0.923`) and belongs in a strip of latest values,
 * not in a chart with a made-up axis. Three points make a curve.
 */
import type { Series } from "./metrics";

export const MIN_CHART_POINTS = 3;

export interface Promoted {
  charted: Series[];
  scalars: Series[];
}

export function promote(series: readonly Series[], minPoints = MIN_CHART_POINTS): Promoted {
  const charted: Series[] = [];
  const scalars: Series[] = [];
  for (const s of series) (s.points.length >= minPoints ? charted : scalars).push(s);
  return { charted, scalars };
}
