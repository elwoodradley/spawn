/** The tab strip above the editor. */
import { For } from "solid-js";

import { activeFilePath, closeTab, setActiveFilePath, tabs } from "../app/state";
import { isDirty } from "../editor/documents";
import Icon from "./Icon";
import "./Tabs.css";

export default function Tabs() {
  return (
    <div class="sp-tabs" role="tablist">
      <For each={tabs()}>
        {(tab) => (
          <div
            class="sp-tab"
            classList={{
              "is-active": activeFilePath() === tab.path,
              "is-dirty": isDirty(tab.path),
            }}
            role="tab"
            aria-selected={activeFilePath() === tab.path}
            title={tab.path}
            onClick={() => setActiveFilePath(tab.path)}
            onAuxClick={(e) => {
              if (e.button === 1) void closeTab(tab.path);
            }}
          >
            <span class="sp-tab-name">{tab.name}</span>
            <button
              class="sp-tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(tab.path);
              }}
            >
              <Icon name={isDirty(tab.path) ? "dot" : "close"} size={12} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
