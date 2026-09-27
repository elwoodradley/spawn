/**
 * Cell chrome in the editor: marker lines get a full-width tint, a gutter
 * mark and a "run" button at their end; the cell the cursor is in gets a
 * faint left border. Plus the editor-level keys that spawn cells, bound at
 * high precedence because CodeMirror otherwise owns Shift-Enter.
 */
import { Prec, RangeSet, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type EditorView,
  gutter,
  GutterMarker,
  keymap,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import { runCommand } from "../app/commands";
import { cellAt, parseCells, type CellRange } from "./cells";

/** Who runs a cell when its button is clicked. Set by the pool commands. */
let runCellAt: ((view: EditorView, pos: number) => void) | null = null;
export function setCellRunner(runner: ((view: EditorView, pos: number) => void) | null): void {
  runCellAt = runner;
}

const markerLine = Decoration.line({ class: "sp-cell-marker" });
const activeLine = Decoration.line({ class: "sp-cell-active" });

class SpawnButton extends WidgetType {
  constructor(private readonly pos: number) {
    super();
  }
  eq(other: SpawnButton): boolean {
    return other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.className = "sp-cell-spawn";
    button.type = "button";
    button.title = "Run this cell in the Interactive Console (Shift+Enter)";
    button.textContent = "▶ run";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      runCellAt?.(view, this.pos);
    });
    return button;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const cells = parseCells(doc);
  if (cells.length <= 1 && cells[0]?.markerLine === null) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const head = view.state.selection.main.head;
  const active = cellAt(cells, head);
  // Decorations must be added in document order, so walk lines once.
  for (const { from, to } of view.visibleRanges) {
    let line = doc.lineAt(from);
    for (;;) {
      const cell = cellAt(cells, line.from);
      const isMarker = cell?.markerLine === line.number;
      if (isMarker) {
        builder.add(line.from, line.from, markerLine);
      } else if (active && cell?.index === active.index && cells.length > 1) {
        builder.add(line.from, line.from, activeLine);
      }
      if (isMarker && cell) {
        builder.add(
          line.to,
          line.to,
          Decoration.widget({ widget: new SpawnButton(cell.from), side: 1 }),
        );
      }
      if (line.to >= to || line.number >= doc.lines) break;
      line = doc.line(line.number + 1);
    }
  }
  return builder.finish();
}

const cellPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

class CellMark extends GutterMarker {
  toDOM(): Node {
    const el = document.createElement("span");
    el.className = "sp-cell-gutter-mark";
    el.textContent = "%%";
    return el;
  }
}
const cellMark = new CellMark();

const cellGutter = gutter({
  class: "sp-cell-gutter",
  markers: (view) => {
    const cells = parseCells(view.state.doc);
    const builder = new RangeSetBuilder<GutterMarker>();
    for (const cell of cells) {
      if (cell.markerLine !== null) builder.add(cell.from, cell.from, cellMark);
    }
    return cells.some((c) => c.markerLine !== null) ? builder.finish() : RangeSet.empty;
  },
  initialSpacer: () => cellMark,
});

/** Keys that CodeMirror would otherwise consume. */
const cellKeymap = Prec.high(
  keymap.of([
    { key: "Shift-Enter", run: () => run("pool.spawnCell") },
    { key: "Mod-Shift-Enter", run: () => run("pool.spawnCellStay") },
    { key: "Alt-Enter", run: () => run("pool.spawnSelection") },
  ]),
);

function run(id: string): boolean {
  void runCommand(id);
  return true;
}

/** Everything cell-related the editor needs. */
export function cellExtensions(): Extension[] {
  return [cellPlugin, cellGutter, cellKeymap];
}

export type { CellRange };
