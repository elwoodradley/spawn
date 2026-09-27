/** Dispatch an Interactive Console payload to its renderer. Text is a plain mono line. */
import { Match, Switch } from "solid-js";

import type { DisplayPayload } from "../../pool/protocol";
import ArrayBlock from "./ArrayBlock";
import ErrorBlock from "./ErrorBlock";
import FigureBlock from "./FigureBlock";
import HtmlBlock from "./HtmlBlock";
import ImagesBlock from "./ImagesBlock";
import MatrixBlock from "./MatrixBlock";
import "./rich.css";
import TableBlock from "./TableBlock";

export default function RichBlock(props: { payload: DisplayPayload }) {
  return (
    <Switch>
      <Match when={props.payload.kind === "text" && props.payload}>
        {(p) => <pre class="sp-rich sp-rich--text mono">{p().text}</pre>}
      </Match>
      <Match when={props.payload.kind === "figure" && props.payload}>
        {(p) => <FigureBlock payload={p()} />}
      </Match>
      <Match when={props.payload.kind === "table" && props.payload}>
        {(p) => <TableBlock payload={p()} />}
      </Match>
      <Match when={props.payload.kind === "array" && props.payload}>
        {(p) => <ArrayBlock payload={p()} />}
      </Match>
      <Match when={props.payload.kind === "matrix" && props.payload}>
        {(p) => <MatrixBlock payload={p()} />}
      </Match>
      <Match when={props.payload.kind === "images" && props.payload}>
        {(p) => <ImagesBlock payload={p()} />}
      </Match>
      <Match when={props.payload.kind === "html" && props.payload}>
        {(p) => <HtmlBlock payload={p()} />}
      </Match>
      <Match when={props.payload.kind === "error" && props.payload}>
        {(p) => <ErrorBlock payload={p()} />}
      </Match>
    </Switch>
  );
}
