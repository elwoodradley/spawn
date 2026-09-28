/**
 * "What changed?" between two kept runs, in plain sentences: which simple
 * settings in the code moved (`lr = 0.01` → `lr = 0.1`), how each final
 * metric moved, and where the best validation value landed.
 *
 * Pure: two RunRecords in, findings and a metric table out. The run panel
 * renders them; nothing here knows about the DOM.
 */
import { lowerIsBetter, type RunRecord } from "./runHistory";

export type Direction = "better" | "worse" | "same";

export interface Finding {
  kind: "code" | "metric" | "note";
  text: string;
  direction?: Direction;
}

export interface MetricRow {
  name: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  direction: Direction | null;
}

export interface Comparison {
  /** The older run and the newer run. */
  a: RunRecord;
  b: RunRecord;
  codeState: "same" | "changed" | "unknown";
  findings: Finding[];
  rows: MetricRow[];
}

export interface LiteralAssignment {
  name: string;
  /** The literal exactly as written. */
  raw: string;
  /** Normalised for comparison: numbers parsed, quotes stripped. */
  value: string;
}

export interface SettingChange {
  name: string;
  label: string;
  from: string;
  to: string;
}

/** Well-known hyperparameter names, in words a first course uses. */
const PARAM_WORDS: Array<[RegExp, string]> = [
  [/^(?:lr|learning_?rate|base_lr|initial_lr|init_lr)$/i, "Learning rate"],
  [/^(?:batch_?size|bs|batch)$/i, "Batch size"],
  [/^(?:epochs?|n_epochs|num_epochs|max_epochs|epoch_count)$/i, "Epochs"],
  [/^(?:weight_?decay|wd|l2|l2_reg)$/i, "Weight decay"],
  [/^(?:dropout|dropout_rate|drop_rate|dropout_p|p_drop)$/i, "Dropout"],
  [/^(?:hidden|hidden_?size|hidden_?dim|n_hidden|hidden_units|num_hidden)$/i, "Hidden size"],
  [/^(?:seed|random_seed|random_state)$/i, "Seed"],
  [/^(?:momentum)$/i, "Momentum"],
  [/^(?:optimizer|optimiser|optim|opt)$/i, "Optimizer"],
  [/^(?:num_layers|n_layers|layers|depth)$/i, "Layers"],
  [/^(?:activation|act)$/i, "Activation"],
  [/^(?:patience)$/i, "Patience"],
  [/^(?:steps|max_steps|num_steps|n_steps|iterations|n_iter|max_iter)$/i, "Steps"],
  [/^(?:model|model_name)$/i, "Model"],
];

export function describeName(name: string): string {
  for (const [re, words] of PARAM_WORDS) if (re.test(name)) return words;
  return name;
}

const LITERAL = String.raw`(-?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|True|False|None)`;
/** `name = lit`, `self.name: float = lit`, `f(name=lit, ...)`; never `==`. */
const ASSIGNMENT = new RegExp(
  String.raw`(?<![\w.])(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*)\s*(?::\s*[\w.\[\], |]+?)?\s*=(?!=)\s*${LITERAL}(?=\s*(?:[,)\]}]|$))`,
  "g",
);

/** Drop a `# comment` that is not inside a string. */
export function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

function normalise(raw: string): string {
  if (/^["']/.test(raw)) return raw.slice(1, -1);
  const n = Number(raw.replace(/_/g, ""));
  return Number.isFinite(n) ? String(n) : raw;
}

/** Every `name = literal` in the code, in order, including keyword arguments. */
export function extractAssignments(code: string): LiteralAssignment[] {
  const out: LiteralAssignment[] = [];
  for (const line of code.split("\n")) {
    for (const m of stripComment(line).matchAll(ASSIGNMENT)) {
      const name = m[1];
      const raw = m[2];
      if (name && raw) out.push({ name, raw, value: normalise(raw) });
    }
  }
  return out;
}

/** Names assigned in both snapshots whose literal values differ. */
export function settingChanges(before: string, after: string): SettingChange[] {
  const group = (list: LiteralAssignment[]) => {
    const map = new Map<string, LiteralAssignment[]>();
    for (const item of list) map.set(item.name, [...(map.get(item.name) ?? []), item]);
    return map;
  };
  const from = group(extractAssignments(before));
  const to = group(extractAssignments(after));
  const changes: SettingChange[] = [];
  for (const [name, olds] of from) {
    const news = to.get(name);
    if (!news) continue;
    const n = Math.max(olds.length, news.length);
    for (let i = 0; i < n; i++) {
      const o = olds[Math.min(i, olds.length - 1)];
      const w = news[Math.min(i, news.length - 1)];
      if (o && w && o.value !== w.value) {
        changes.push({ name, label: describeName(name), from: o.raw, to: w.raw });
        break;
      }
    }
  }
  return changes;
}

/** Three significant digits, no scientific notation for ordinary sizes. */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  return String(Number(value.toPrecision(3)));
}

function percent(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round((Math.abs(to - from) / Math.abs(from)) * 100);
}

function direction(name: string, from: number, to: number): Direction {
  if (from === to) return "same";
  const better = lowerIsBetter(name) ? to < from : to > from;
  return better ? "better" : "worse";
}

/** "final val_acc dropped 8% (0.91 → 0.84)." */
export function describeFinal(name: string, from: number, to: number): Finding {
  const dir = direction(name, from, to);
  if (dir === "same")
    return { kind: "metric", text: `final ${name} unchanged at ${fmt(to)}.`, direction: dir };
  const verb = dir === "better" ? "improved" : lowerIsBetter(name) ? "rose" : "dropped";
  const pct = percent(from, to);
  const amount = pct === null || pct < 1 ? "slightly" : `${pct}%`;
  return {
    kind: "metric",
    text: `final ${name} ${verb} ${amount} (${fmt(from)} → ${fmt(to)}).`,
    direction: dir,
  };
}

function describeBest(a: RunRecord, b: RunRecord): Finding[] {
  const unit = b.xUnit === "epoch" || a.xUnit === "epoch" ? "epoch" : "step";
  const out: Finding[] = [];
  for (const [name, was] of Object.entries(a.best ?? {})) {
    const now = b.best?.[name];
    if (!now) continue;
    const dir = direction(name, was.value, now.value);
    const at = (s: number) => `${unit} ${s}`;
    if (dir === "same") {
      if (was.step === now.step) continue;
      out.push({
        kind: "metric",
        text: `best ${name} stayed ${fmt(now.value)} but came at ${at(now.step)} instead of ${at(was.step)}.`,
        direction: dir,
      });
      continue;
    }
    const verb = dir === "better" ? "improved" : "got worse";
    out.push({
      kind: "metric",
      text: `best ${name} ${verb}: ${fmt(was.value)} at ${at(was.step)} → ${fmt(now.value)} at ${at(now.step)}.`,
      direction: dir,
    });
  }
  return out;
}

function codeFindings(
  a: RunRecord,
  b: RunRecord,
): { state: Comparison["codeState"]; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!a.snapshot || !b.snapshot) {
    const missing = !a.snapshot ? a : b;
    findings.push({
      kind: "note",
      text: `Run #${missing.id} has no saved code, so the code cannot be compared.`,
    });
    return { state: "unknown", findings };
  }
  if (a.snapshot.python !== b.snapshot.python) {
    findings.push({
      kind: "code",
      text: `Python interpreter changed: ${a.snapshot.python} → ${b.snapshot.python}.`,
    });
  }
  if (a.snapshot.code === b.snapshot.code) {
    findings.push({ kind: "code", text: "No code changed between these runs." });
    return { state: "same", findings };
  }
  const changes = settingChanges(a.snapshot.code, b.snapshot.code);
  for (const c of changes)
    findings.push({ kind: "code", text: `${c.label} went ${c.from} → ${c.to}.` });
  if (changes.length === 0) {
    findings.push({
      kind: "code",
      text: "The code changed, but no simple `name = value` setting differs; see the diff below.",
    });
  }
  if (a.snapshot.truncated || b.snapshot.truncated) {
    findings.push({
      kind: "note",
      text: "A snapshot was cut at 200 KB, so the diff may be incomplete.",
    });
  }
  return { state: "changed", findings };
}

function metricFindings(a: RunRecord, b: RunRecord): { findings: Finding[]; rows: MetricRow[] } {
  const fa = a.finals ?? {};
  const fb = b.finals ?? {};
  const names = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort((x, y) =>
    x.localeCompare(y),
  );
  const findings: Finding[] = [];
  const rows: MetricRow[] = [];
  let shared = 0;
  let identical = 0;
  for (const name of names) {
    const from = fa[name];
    const to = fb[name];
    if (from !== undefined && to !== undefined) {
      shared++;
      const f = describeFinal(name, from, to);
      if (f.direction === "same") identical++;
      else findings.push(f);
      rows.push({ name, a: from, b: to, delta: to - from, direction: f.direction ?? null });
    } else {
      const only = from === undefined ? b : a;
      findings.push({ kind: "note", text: `${name} was only printed in run #${only.id}.` });
      rows.push({ name, a: from ?? null, b: to ?? null, delta: null, direction: null });
    }
  }
  if (shared === 0)
    findings.unshift({ kind: "note", text: "The runs printed no metric in common." });
  else if (identical === shared) {
    findings.unshift({
      kind: "metric",
      text: "Same result: every final metric is identical.",
      direction: "same",
    });
  }
  return { findings, rows };
}

/** Oldest first, so "went 0.01 → 0.1" reads in time order. */
export function orderPair(x: RunRecord, y: RunRecord): [RunRecord, RunRecord] {
  return x.startedAt <= y.startedAt ? [x, y] : [y, x];
}

export function compareRuns(x: RunRecord, y: RunRecord): Comparison {
  const [a, b] = orderPair(x, y);
  const findings: Finding[] = [];
  if (a.file !== b.file) {
    findings.push({
      kind: "note",
      text: `These runs are from different files: ${a.file} and ${b.file}.`,
    });
  }
  const code = codeFindings(a, b);
  const metric = metricFindings(a, b);
  findings.push(...code.findings, ...metric.findings, ...describeBest(a, b));
  return { a, b, codeState: code.state, findings, rows: metric.rows };
}
