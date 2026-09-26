/**
 * The Pool tab of the sidebar: every variable in the pool with a one-line
 * summary. Click one to inspect it into the console as a rich block.
 */
import { createMemo, For, Show } from "solid-js";

import { output } from "../spawn/controller";
import Icon from "../ui/Icon";
import { pool, poolStatus } from "./client";
import type { VariableInfo } from "./protocol";
import {
  clearVariables,
  filterVariables,
  lastRefreshAt,
  refreshVariables,
  setVariableFilter,
  sortVariables,
  typeClass,
  variableFilter,
  variables,
} from "./variables";
import "./VariablesPane.css";

export default function VariablesPane() {
  const shown = createMemo(() =>
    sortVariables(
      filterVariables(variables.list, variableFilter()),
      variables.changedAt,
      lastRefreshAt(),
    ),
  );

  const inspect = async (v: VariableInfo) => {
    output.system(`inspect ${v.name}`);
    const payload = await pool().inspect(v.name);
    if (payload) output.appendRich(payload, 0);
    else output.append("croak", `${v.name} could not be inspected\n`);
  };

  const restart = async () => {
    await pool().restart();
    clearVariables();
  };

  const cold = () => poolStatus() === "cold";

  return (
    <section class="sp-vars" aria-label="Pool variables">
      <header class="sp-vars__header">
        <span class="sp-vars__title">POOL</span>
        <span class="sp-vars__status" classList={{ [`is-${poolStatus()}`]: true }}>
          {poolStatus()}
        </span>
        <span class="sp-vars__spacer" />
        <button
          class="sp-vars__btn"
          title="Refresh variables"
          disabled={cold()}
          onClick={() => void refreshVariables()}
        >
          <Icon name="refresh" />
        </button>
        <button
          class="sp-vars__btn"
          title="Clear the pool (restart the kernel)"
          disabled={cold()}
          onClick={() => void restart()}
        >
          <Icon name="trash" />
        </button>
      </header>
      <div class="sp-vars__search">
        <Icon name="search" size={12} />
        <input
          type="text"
          placeholder="Filter variables"
          spellcheck={false}
          value={variableFilter()}
          onInput={(e) => setVariableFilter(e.currentTarget.value)}
        />
      </div>
      <Show when={variables.error}>
        <p class="sp-vars__error">{variables.error}</p>
      </Show>
      <Show
        when={shown().length > 0}
        fallback={
          <p class="sp-vars__empty">
            {cold()
              ? "The pool is cold. Spawn a cell or selection into it to start."
              : variables.list.length === 0
                ? "Nothing in the pool yet."
                : "No variable matches."}
          </p>
        }
      >
        <ul class="sp-vars__list" role="list">
          <For each={shown()}>
            {(v) => (
              <li>
                <button
                  class="sp-vars__row"
                  classList={{ "is-recent": (variables.changedAt[v.name] ?? 0) >= lastRefreshAt() }}
                  title={`${v.type} · click to inspect`}
                  onClick={() => void inspect(v)}
                >
                  <span class={`sp-vars__badge ${typeClass(v.type)}`}>{v.type}</span>
                  <span class="sp-vars__name mono">{v.name}</span>
                  <span class="sp-vars__summary mono">{v.summary}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
