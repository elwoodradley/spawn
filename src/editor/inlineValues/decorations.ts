/**
 * The editor side of inline values: a StateField of end-of-line widgets,
 * rebuilt from the module store whenever the document changes, the
 * configuration changes (a tab swap reconfigures the live view) or a refresh
 * effect arrives. A line whose text differs from what ran shows nothing
 * until it is run again. The field sits in a Compartment so the setting can
 * remove it entirely.
 */
import {
  Compartment,
  Facet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import { inlineEntries } from "./store";

/** The document's file path, so the field knows which values are its own. */
export const inlineValuesPath = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

/** Ask the field to rebuild from the store. */
export const refreshInlineValues = StateEffect.define<null>();

export const inlineValuesCompartment = new Compartment();

class ValueWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly title: string,
  ) {
    super();
  }
  eq(other: ValueWidget): boolean {
    return other.label === this.label && other.title === this.title;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "sp-inline-value";
    el.textContent = `→ ${this.label}`;
    el.title = this.title;
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  /** Let clicks fall through so they place the cursor as usual. */
  ignoreEvent(): boolean {
    return false;
  }
}

function build(state: EditorState): DecorationSet {
  const path = state.facet(inlineValuesPath);
  if (!path) return Decoration.none;
  const entries = inlineEntries(path);
  if (entries.length === 0) return Decoration.none;
  const doc = state.doc;
  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    if (entry.line > doc.lines) continue;
    const line = doc.line(entry.line);
    if (line.text !== entry.text) continue;
    builder.add(
      line.to,
      line.to,
      Decoration.widget({ widget: new ValueWidget(entry.label, entry.title), side: 1 }),
    );
  }
  return builder.finish();
}

const field = StateField.define<DecorationSet>({
  create: build,
  update(deco, tr) {
    const asked = tr.effects.some((e) => e.is(refreshInlineValues));
    return tr.docChanged || tr.reconfigured || asked ? build(tr.state) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** What the compartment holds for the current setting. */
export function inlineValuesExtension(enabled: boolean): Extension {
  return enabled ? field : [];
}

/** Push the setting and the store's current values into a live view. */
export function syncInlineValues(view: EditorView, enabled: boolean): void {
  view.dispatch({
    effects: [
      inlineValuesCompartment.reconfigure(inlineValuesExtension(enabled)),
      refreshInlineValues.of(null),
    ],
  });
}
