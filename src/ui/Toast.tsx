/** Draws the toast stack, bottom-right. Click a toast to dismiss it. */
import { For } from "solid-js";

import { dismissToast, toasts } from "../app/toast";
import "./Toast.css";

export default function ToastHost() {
  return (
    <div class="sp-toasts" aria-live="polite">
      <For each={toasts()}>
        {(item) => (
          <button
            class="sp-toast"
            classList={{ [`is-${item.kind}`]: true }}
            onClick={() => dismissToast(item.id)}
            title="Dismiss"
          >
            {item.message}
          </button>
        )}
      </For>
    </div>
  );
}
