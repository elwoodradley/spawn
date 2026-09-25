/** Small inline icons. Stroke follows `currentColor` so themes colour them. */
import { Show } from "solid-js";

const PATHS: Record<string, string> = {
  "chevron-right": "M6 4l4 4-4 4",
  "chevron-down": "M4 6l4 4 4-4",
  file: "M4 2h5l3 3v9H4z M9 2v3h3",
  folder: "M2 4h4l1.5 1.5H14v8H2z",
  "folder-open": "M2 4h4l1.5 1.5H14v2H4l-2 5z",
  close: "M4 4l8 8M12 4l-8 8",
  dot: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  search: "M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l4 4",
  sidebar: "M2 3h12v10H2z M6 3v10",
  panel: "M2 3h12v10H2z M2 9h12",
};

export type IconName = keyof typeof PATHS;

export default function Icon(props: { name: IconName; size?: number }) {
  const size = () => props.size ?? 14;
  return (
    <Show when={PATHS[props.name]}>
      {(d) => (
        <svg
          width={size()}
          height={size()}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={d()} />
        </svg>
      )}
    </Show>
  );
}
