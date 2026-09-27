/**
 * The stdin row. Enter sends the line; Ctrl-D sends EOF. Takes focus when a
 * spawn starts so a program that asks a question gets answered here.
 */
import { createEffect, createSignal, on } from "solid-js";

import { poolStatus } from "../pool/client";
import { closeStdin, spawnStatus, stdinFocusTick, writeStdin } from "../spawn/controller";

export default function StdinRow() {
  let input: HTMLInputElement | undefined;
  const [value, setValue] = createSignal("");
  const running = () => spawnStatus() === "running" || poolStatus() === "busy";

  createEffect(
    on(stdinFocusTick, (tick) => {
      if (tick > 0) input?.focus();
    }),
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const text = value();
      setValue("");
      void writeStdin(text);
    } else if (event.key === "d" && event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void closeStdin();
    }
  };

  return (
    <div class="sp-output__stdin" classList={{ "is-idle": !running() }}>
      <span class="sp-output__prompt mono" aria-hidden="true">
        ›
      </span>
      <input
        ref={(el) => (input = el)}
        class="sp-output__stdin-input mono"
        type="text"
        spellcheck={false}
        autocomplete="off"
        disabled={!running()}
        placeholder={
          running() ? "stdin · Enter to send, Ctrl+D for EOF" : "run something to send it input"
        }
        value={value()}
        onInput={(event) => setValue(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        aria-label="Program input"
      />
    </div>
  );
}
