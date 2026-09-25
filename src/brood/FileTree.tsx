/** The brood's folder tree. */
import { For, Show } from "solid-js";

import { activeFilePath, brood, openFile } from "../app/state";
import { runCommand } from "../app/commands";
import { baseName } from "../ipc";
import Icon from "../ui/Icon";
import { toggleDirectory, treeRows } from "./store";
import type { TreeRow } from "./tree";
import "./FileTree.css";

function Row(props: { row: TreeRow }) {
  const node = () => props.row.node;
  const isActive = () => activeFilePath() === node().path;

  const activate = () => {
    if (node().isDirectory) void toggleDirectory(node().path);
    else void openFile(node().path);
  };

  return (
    <div
      class="sp-tree-row"
      classList={{ "is-active": isActive(), "is-dir": node().isDirectory }}
      style={{ "--depth": props.row.depth }}
      role="treeitem"
      tabIndex={0}
      aria-expanded={node().isDirectory ? node().expanded : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
    >
      <span class="sp-tree-chevron">
        <Show when={node().isDirectory}>
          <Icon name={node().expanded ? "chevron-down" : "chevron-right"} />
        </Show>
      </span>
      <span class="sp-tree-icon">
        <Icon name={node().isDirectory ? (node().expanded ? "folder-open" : "folder") : "file"} />
      </span>
      <span class="sp-tree-name">{node().name}</span>
    </div>
  );
}

export default function FileTree() {
  return (
    <div class="sp-tree" role="tree">
      <Show
        when={brood()}
        fallback={
          <div class="sp-tree-empty">
            <p>No brood open.</p>
            <button class="sp-button" onClick={() => void runCommand("brood.open")}>
              Open a brood
            </button>
          </div>
        }
      >
        {(root) => (
          <>
            <div class="sp-tree-header" title={root()}>
              {baseName(root())}
            </div>
            <div class="sp-tree-rows">
              <For each={treeRows()}>{(row) => <Row row={row} />}</For>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
