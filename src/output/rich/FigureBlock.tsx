/**
 * A rendered figure from the Interactive Console. PNG via a data URL, SVG inline. Fits the
 * panel width; click toggles natural size. Right-click copies or saves it.
 */
import { createSignal, Show } from "solid-js";

import { toast } from "../../app/toast";
import { pickSaveImage, writeBytes } from "../../ipc";
import { sanitizeSvg } from "./sanitizeSvg";
import type { DisplayPayload } from "../../pool/protocol";
import { showContextMenu } from "../../ui/ContextMenu";

type Figure = Extract<DisplayPayload, { kind: "figure" }>;

export default function FigureBlock(props: { payload: Figure }) {
  const [natural, setNatural] = createSignal(false);
  const src = () => `data:image/png;base64,${props.payload.data}`;
  const label = () => props.payload.title ?? "figure";

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { kind: "action", label: "Copy image", run: () => copyFigure(props.payload) },
      {
        kind: "action",
        label: props.payload.format === "svg" ? "Save SVG…" : "Save PNG…",
        run: () => saveFigure(props.payload),
      },
      { kind: "separator" },
      {
        kind: "action",
        label: natural() ? "Fit to panel" : "Natural size",
        run: () => {
          setNatural(!natural());
        },
      },
    ]);
  };

  return (
    <figure
      class="sp-rich sp-rich--figure"
      classList={{ "is-natural": natural() }}
      onContextMenu={onContextMenu}
      onClick={() => setNatural(!natural())}
      title={`${label()} · ${props.payload.width}×${props.payload.height} · click to toggle size`}
    >
      <Show
        when={props.payload.format === "png"}
        fallback={<div class="sp-rich__svg" innerHTML={sanitizeSvg(props.payload.data)} />}
      >
        <img
          class="sp-rich__img"
          src={src()}
          width={props.payload.width}
          height={props.payload.height}
          alt={label()}
        />
      </Show>
      <Show when={props.payload.title}>
        <figcaption class="sp-rich__caption">{props.payload.title}</figcaption>
      </Show>
    </figure>
  );
}

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function figureBytes(figure: Figure): Uint8Array {
  return figure.format === "png"
    ? decodeBase64(figure.data)
    : new TextEncoder().encode(figure.data);
}

async function copyFigure(figure: Figure): Promise<void> {
  try {
    const type = figure.format === "png" ? "image/png" : "image/svg+xml";
    const blob = new Blob([figureBytes(figure) as BlobPart], { type });
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    toast("Copied image");
  } catch (err) {
    toast(`Could not copy image: ${err instanceof Error ? err.message : String(err)}`, {
      kind: "croak",
    });
  }
}

async function saveFigure(figure: Figure): Promise<void> {
  const name = `${(figure.title ?? "figure").replace(/[^\w.-]+/g, "_")}.${figure.format}`;
  const path = await pickSaveImage(name, figure.format);
  if (!path) return;
  try {
    await writeBytes(path, figureBytes(figure));
    toast(`Saved ${path}`, { kind: "success" });
  } catch (err) {
    toast(`Could not save: ${err instanceof Error ? err.message : String(err)}`, {
      kind: "croak",
    });
  }
}
