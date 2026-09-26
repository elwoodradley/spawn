/**
 * A drag handle between two panes. Reports pointer deltas; the parent sizes.
 * Double-click resets the pane to its default size.
 */
import { createSignal } from "solid-js";

import "./Splitter.css";

export interface SplitterProps {
  /** `vertical` is a vertical bar that resizes widths; `horizontal` resizes heights. */
  direction: "vertical" | "horizontal";
  onDrag: (delta: number) => void;
  onReset?: () => void;
  /** For the accessible name: what the handle resizes. */
  label?: string;
}

export default function Splitter(props: SplitterProps) {
  let last = 0;
  const [dragging, setDragging] = createSignal(false);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    last = props.direction === "vertical" ? e.clientX : e.clientY;
    setDragging(true);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    if (!target.hasPointerCapture(e.pointerId)) return;
    const now = props.direction === "vertical" ? e.clientX : e.clientY;
    props.onDrag(now - last);
    last = now;
  };

  const onPointerUp = (e: PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  return (
    <div
      class={`sp-splitter sp-splitter-${props.direction}`}
      classList={{ "is-dragging": dragging() }}
      role="separator"
      aria-orientation={props.direction}
      aria-label={props.label ?? "Resize"}
      title={props.onReset ? "Drag to resize · double-click to reset" : "Drag to resize"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDblClick={() => props.onReset?.()}
    />
  );
}
