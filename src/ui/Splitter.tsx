/**
 * A drag handle between two panes. Reports pointer deltas; the parent sizes.
 * Double-click resets the pane to its default size.
 *
 * The drag is tracked on `window`, not just the handle: once the pointer is
 * down we follow it anywhere, so a fast drag that leaves the 7px band, or a
 * webview without pointer capture, still resizes. While dragging, `body`
 * gets `is-resizing` so text selection and iframes cannot steal the pointer.
 */
import { createSignal, onCleanup } from "solid-js";

import "./Splitter.css";

export interface SplitterProps {
  /** `vertical` is a vertical bar that resizes widths; `horizontal` resizes heights. */
  direction: "vertical" | "horizontal";
  onDrag: (delta: number) => void;
  onReset?: () => void;
  /** For the accessible name: what the handle resizes. */
  label?: string;
}

export const RESIZING_CLASS = "is-resizing";

export default function Splitter(props: SplitterProps) {
  let last = 0;
  let activePointer: number | null = null;
  const [dragging, setDragging] = createSignal(false);

  const coordinate = (e: PointerEvent) => (props.direction === "vertical" ? e.clientX : e.clientY);

  const onMove = (e: PointerEvent) => {
    if (activePointer === null || e.pointerId !== activePointer) return;
    const now = coordinate(e);
    props.onDrag(now - last);
    last = now;
  };

  const stop = (target: HTMLElement | null) => {
    if (activePointer === null) return;
    if (target && target.hasPointerCapture?.(activePointer)) {
      target.releasePointerCapture(activePointer);
    }
    activePointer = null;
    setDragging(false);
    document.body.classList.remove(RESIZING_CLASS);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onWindowUp);
    window.removeEventListener("pointercancel", onWindowUp);
  };

  let handle: HTMLDivElement | undefined;
  const onWindowUp = () => stop(handle ?? null);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    activePointer = e.pointerId;
    last = coordinate(e);
    setDragging(true);
    document.body.classList.add(RESIZING_CLASS);
    // Capture where supported; the window listeners cover the rest.
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      // Some engines throw for synthetic or already-released pointers.
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    e.preventDefault();
  };

  onCleanup(() => stop(handle ?? null));

  return (
    <div
      ref={(el) => (handle = el)}
      class={`sp-splitter sp-splitter-${props.direction}`}
      classList={{ "is-dragging": dragging() }}
      role="separator"
      aria-orientation={props.direction}
      aria-label={props.label ?? "Resize"}
      title={props.onReset ? "Drag to resize · double-click to reset" : "Drag to resize"}
      onPointerDown={onPointerDown}
      onDblClick={() => props.onReset?.()}
    />
  );
}
