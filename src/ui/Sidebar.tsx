/**
 * The left sidebar: a small tab strip over the project tree and the
 * Interactive Console's variables pane. Which tab is showing is part of the
 * saved session.
 */
import { Show } from "solid-js";

import { setSidebarTab, setSidebarVisible, sidebarTab, type SidebarTab } from "../app/layout";
import { chordLabel } from "../app/keybindings";
import FileTree from "../brood/FileTree";
import VariablesPane from "../pool/VariablesPane";
import Icon from "./Icon";
import "./Sidebar.css";

const TABS: Array<{ id: SidebarTab; label: string; title: string }> = [
  { id: "brood", label: "Project", title: "Files in the open project" },
  { id: "pool", label: "Variables", title: "Variables in the Interactive Console (Ctrl+Shift+V)" },
];

export default function Sidebar() {
  return (
    <div class="sp-sidebar-host">
      <div class="sp-sidebar-tabs" role="tablist" aria-label="Sidebar">
        {TABS.map((t) => (
          <button
            class="sp-sidebar-tab"
            classList={{ "is-active": sidebarTab() === t.id }}
            role="tab"
            aria-selected={sidebarTab() === t.id}
            title={t.title}
            onClick={() => setSidebarTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span class="sp-sidebar-tabs__spacer" />
        <button
          class="sp-sidebar-collapse"
          title={`Hide sidebar (${chordLabel("Mod-B")})`}
          aria-label="Hide sidebar"
          onClick={() => setSidebarVisible(false)}
        >
          <Icon name="chevron-left" size={14} />
        </button>
      </div>
      <div class="sp-sidebar-body">
        <Show when={sidebarTab() === "brood"}>
          <FileTree />
        </Show>
        <Show when={sidebarTab() === "pool"}>
          <VariablesPane />
        </Show>
      </div>
    </div>
  );
}
