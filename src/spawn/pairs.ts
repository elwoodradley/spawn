/**
 * Group metric series into charts. A train series and a val series of the
 * same metric share one chart so overfitting reads as a widening gap; every
 * other series gets a chart of its own.
 *
 * Pure, so the run panel and tests can call it on any Series[].
 */
import type { Series } from "./metrics";

export interface ChartGroup {
  /** The metric name with any train/val affix removed. */
  metric: string;
  train?: Series;
  val?: Series;
  /** Series in this group that are neither train nor val (unpaired ones). */
  others: Series[];
}

type Side = "train" | "val";

const TRAIN_PREFIX = /^(?:train|training|tr)[_/.-]/i;
const VAL_PREFIX = /^(?:val|valid|validation|dev|test)[_/.-]/i;
const TRAIN_SUFFIX = /[_/.-](?:train|training|tr)$/i;
const VAL_SUFFIX = /[_/.-](?:val|valid|validation|dev|test)$/i;

/** Which side a name belongs to and the metric left once the affix is gone. */
export function classify(name: string): { side: Side | null; metric: string } {
  if (TRAIN_PREFIX.test(name)) return { side: "train", metric: name.replace(TRAIN_PREFIX, "") };
  if (VAL_PREFIX.test(name)) return { side: "val", metric: name.replace(VAL_PREFIX, "") };
  if (TRAIN_SUFFIX.test(name)) return { side: "train", metric: name.replace(TRAIN_SUFFIX, "") };
  if (VAL_SUFFIX.test(name)) return { side: "val", metric: name.replace(VAL_SUFFIX, "") };
  return { side: null, metric: name };
}

const LOSS_LIKE = /loss|nll|cost|error|err$/i;

function groupRank(group: ChartGroup): number {
  return LOSS_LIKE.test(group.metric) ? 0 : 1;
}

/**
 * Pair `loss` with `val_loss`, `train/acc` with `val/acc`, and so on. A bare
 * name (no affix) counts as the train side when a val side of that metric
 * exists; otherwise it stands alone. Loss-like groups come first, then the
 * rest alphabetically, so the chart people look at most is at the top.
 */
export function groupSeries(series: readonly Series[]): ChartGroup[] {
  const groups = new Map<string, ChartGroup>();
  const bare: Series[] = [];

  const groupFor = (metric: string): ChartGroup => {
    const key = metric.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { metric, others: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const s of series) {
    const { side, metric } = classify(s.name);
    if (side === null) {
      bare.push(s);
      continue;
    }
    const g = groupFor(metric);
    if (g[side]) g.others.push(s);
    else g[side] = s;
  }

  for (const s of bare) {
    const existing = groups.get(s.name.toLowerCase());
    if (existing && !existing.train && existing.val) existing.train = s;
    else {
      const g = groupFor(s.name);
      if (g.train || g.val) g.others.push(s);
      else g.others.push(s);
    }
  }

  return [...groups.values()].sort((a, b) => {
    const rank = groupRank(a) - groupRank(b);
    return rank !== 0 ? rank : a.metric.localeCompare(b.metric);
  });
}

/** Every series a group draws, train first, then val, then the rest. */
export function groupLines(group: ChartGroup): Series[] {
  const out: Series[] = [];
  if (group.train) out.push(group.train);
  if (group.val) out.push(group.val);
  return out.concat(group.others);
}
