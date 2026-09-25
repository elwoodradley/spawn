/** A drag handle between two panes. Reports pointer deltas; the parent sizes. */
import "./Splitter.css";

export interface SplitterProps {
  /** `vertical` is a vertical bar that resizes widths; `horizontal` resizes heights. */
  direction: "vertical" | "horizontal";
  onDrag: (delta: number) => void;
}

export default function Splitter(props: SplitterProps) {
  let last = 0;

  const onPointerDown = (e: PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    last = props.direction === "vertical" ? e.clientX : e.clientY;
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
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      class={`sp-splitter sp-splitter-${props.direction}`}
      role="separator"
      aria-orientation={props.direction}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
