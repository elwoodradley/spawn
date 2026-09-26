/**
 * One modal dialog at a time: About, shortcuts, small notices. Content is
 * JSX so callers can render tables or paths; actions are plain buttons.
 */
import { createSignal, For, Show, type JSX } from "solid-js";

import "./Dialog.css";

export interface DialogAction {
  label: string;
  primary?: boolean;
  /** Return false to keep the dialog open. */
  run?: () => void | boolean | Promise<void | boolean>;
}

export interface DialogSpec {
  title: string;
  content: JSX.Element | string;
  actions?: DialogAction[];
  /** Wider layout for tables. */
  wide?: boolean;
}

const [dialog, setDialog] = createSignal<DialogSpec | null>(null);

export function showDialog(spec: DialogSpec): void {
  setDialog(spec);
}

export function closeDialog(): void {
  setDialog(null);
}

export function isDialogOpen(): boolean {
  return dialog() !== null;
}

export default function DialogHost() {
  const runAction = async (action: DialogAction) => {
    const keep = await action.run?.();
    if (keep !== false) closeDialog();
  };

  return (
    <Show when={dialog()}>
      {(spec) => (
        <div
          class="sp-dialog-backdrop"
          onClick={closeDialog}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeDialog();
            }
          }}
        >
          <div
            class="sp-dialog"
            classList={{ "is-wide": spec().wide }}
            role="dialog"
            aria-modal="true"
            aria-label={spec().title}
            onClick={(e) => e.stopPropagation()}
          >
            <header class="sp-dialog__title">{spec().title}</header>
            <div class="sp-dialog__body">{spec().content}</div>
            <footer class="sp-dialog__actions">
              <For each={spec().actions ?? [{ label: "Close", primary: true }]}>
                {(action) => (
                  <button
                    class="sp-dialog__button"
                    classList={{ "is-primary": action.primary }}
                    ref={(el) => {
                      if (action.primary) queueMicrotask(() => el.focus());
                    }}
                    onClick={() => void runAction(action)}
                  >
                    {action.label}
                  </button>
                )}
              </For>
            </footer>
          </div>
        </div>
      )}
    </Show>
  );
}
