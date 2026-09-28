/**
 * A slim bar under the output header with one suggestion at a time: the
 * message, "Later" (this session) and "Dismiss" (never again).
 */
import { Show } from "solid-js";

import "./NudgeBar.css";
import { currentNudge, dismissNudge, snoozeNudge } from "./store";

export default function NudgeBar() {
  return (
    <Show when={currentNudge()}>
      {(nudge) => (
        <div class="sp-nudge sp-chrome" role="status">
          <span class="sp-nudge__text">{nudge().message}</span>
          <span class="sp-nudge__actions">
            <button
              class="sp-nudge__btn"
              title="Hide this until SPAWN is restarted"
              onClick={() => snoozeNudge(nudge().id)}
            >
              Later
            </button>
            <button
              class="sp-nudge__btn"
              title="Never show this suggestion again"
              onClick={() => dismissNudge(nudge().id)}
            >
              Dismiss
            </button>
          </span>
        </div>
      )}
    </Show>
  );
}
