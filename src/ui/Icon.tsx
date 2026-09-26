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
  "file-plus": "M4 2h5l3 3v9H4z M9 2v3h3 M8 7v5 M5.5 9.5h5",
  "folder-plus": "M2 4h4l1.5 1.5H14v8H2z M8 7v5 M5.5 9.5h5",
  refresh: "M13 8a5 5 0 1 1-1.5-3.5 M13 3v3h-3",
  collapse: "M4 6l4-4 4 4 M4 14l4-4 4 4",
  play: "M5 3l8 5-8 5z",
  trash: "M3 4h10 M6 4V2h4v2 M5 4v9h6V4",
  edit: "M11 2l3 3-8 8H3v-3z",
  copy: "M6 6h8v8H6z M4 10H2V2h8v2",
  check: "M3 8l3 3 7-7",
  "chevron-up": "M4 10l4-4 4 4",
  info: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M8 7v4 M8 5v.5",
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
