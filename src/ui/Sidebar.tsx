/**
 * The left sidebar: a small tab strip over the brood tree and the pool's
 * variables pane. Which tab is showing is part of the clutch.
 */
import { Show } from "solid-js";

import { setSidebarTab, sidebarTab, type SidebarTab } from "../app/layout";
import FileTree from "../brood/FileTree";
import VariablesPane from "../pool/VariablesPane";
import "./Sidebar.css";

const TABS: Array<{ id: SidebarTab; label: string; title: string }> = [
  { id: "brood", label: "Brood", title: "Files in the open brood" },
  { id: "pool", label: "Pool", title: "Variables living in the pool (Ctrl+Shift+V)" },
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
