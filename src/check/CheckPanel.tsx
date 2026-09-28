/**
 * The Check tab: a summary line, then one row per check with a
 * traffic-light icon, a plain-language title, an optional hint, a jump to
 * the offending line, per-path rows and the raw output behind a toggle.
 */
import { For, Show } from "solid-js";

import { runCommand } from "../app/commands";
import { chordLabel } from "../app/keybindings";
import { activeFilePath, openFile } from "../app/state";
import { baseName } from "../ipc";
import "./CheckPanel.css";
import type { CheckItem, CheckRow, CheckState } from "./model";
import { cancelCheck, checkItems, checkStatus, checkSummary, checkedFile } from "./runner";

const GLYPH: Record<CheckState, string> = {
  pass: "✓",
  fail: "✗",
  warn: "!",
  skip: "–",
  running: "",
};
const LABEL: Record<CheckState, string> = {
  pass: "passed",
  fail: "failed",
  warn: "look at this",
  skip: "skipped",
  running: "running",
};

function StateIcon(props: { state: CheckState }) {
  return (
    <span
      class="sp-check__icon"
      classList={{ [`is-${props.state}`]: true }}
      role="img"
      aria-label={LABEL[props.state]}
    >
      {GLYPH[props.state]}
    </span>
  );
}

function Row(props: { row: CheckRow }) {
  return (
    <li class="sp-check__row">
      <StateIcon state={props.row.state} />
      <span class="sp-check__row-text">{props.row.text}</span>
      <Show when={props.row.link}>
        {(link) => (
          <button
            class="sp-check__jump"
            title={`Open ${link().file} at line ${link().line}`}
            onClick={() => void openFile(link().file, link().line)}
          >
            line {link().line}
          </button>
        )}
      </Show>
    </li>
  );
}

function Item(props: { item: CheckItem }) {
  return (
    <li class="sp-check__item" classList={{ [`is-${props.item.state}`]: true }}>
      <div class="sp-check__head">
        <StateIcon state={props.item.state} />
        <div class="sp-check__text">
          <p class="sp-check__title">{props.item.title}</p>
          <Show when={props.item.hint}>
            <p class="sp-check__hint">{props.item.hint}</p>
          </Show>
        </div>
        <Show when={props.item.link}>
          {(link) => (
            <button
              class="sp-check__jump"
              title={`Open ${link().file} at line ${link().line}`}
              onClick={() => void openFile(link().file, link().line)}
            >
              Go to line {link().line}
            </button>
          )}
        </Show>
        <Show when={props.item.action}>
          {(action) => (
            <button class="sp-check__jump" onClick={() => void runCommand(action().command)}>
              {action().label}
            </button>
          )}
        </Show>
      </div>
      <Show when={props.item.rows && props.item.rows.length > 0}>
        <ul class="sp-check__rows">
          <For each={props.item.rows}>{(row) => <Row row={row} />}</For>
        </ul>
      </Show>
      <Show when={props.item.detail}>
        {(detail) => (
          <details class="sp-check__details" open={props.item.state === "fail"}>
            <summary>Output</summary>
            <pre class="sp-check__output mono">{detail()}</pre>
          </details>
        )}
      </Show>
    </li>
  );
}

export default function CheckPanel() {
  const running = () => checkStatus() === "running";
  const canCheck = () => /\.pyw?$/i.test(activeFilePath() ?? "");
  return (
    <section class="sp-check" aria-label="Check before submitting">
      <header class="sp-check__bar">
        <span class="sp-check__summary" classList={{ "is-running": running() }}>
          {checkSummary() || "Check before submitting"}
        </span>
        <Show when={checkedFile()}>
          {(file) => <span class="sp-check__file mono">{baseName(file())}</span>}
        </Show>
        <span class="sp-check__spacer" />
        <Show
          when={running()}
          fallback={
            <button
              class="sp-check__button is-primary"
              disabled={!canCheck()}
              title={`Check the current file before submitting (${chordLabel("F6")})`}
              onClick={() => void runCommand("check.run")}
            >
              Check
            </button>
          }
        >
          <button class="sp-check__button is-stop" onClick={cancelCheck}>
            Cancel
          </button>
        </Show>
      </header>
      <Show
        when={checkItems().length > 0}
        fallback={
          <div class="sp-check__empty">
            <p>Before you hand a program in, SPAWN can check it the way a grader will see it.</p>
            <p class="sp-check__legend">
              It runs the whole file in a fresh Python process (nothing left over from the
              Interactive Console), compares the Python version with what the course expects, checks
              that the files the program opens exist from the folder it runs in, and runs the
              project's tests. Press {chordLabel("F6")} or the Check button.
            </p>
          </div>
        }
      >
        <ul class="sp-check__list">
          <For each={checkItems()}>{(item) => <Item item={item} />}</For>
        </ul>
      </Show>
    </section>
  );
}
