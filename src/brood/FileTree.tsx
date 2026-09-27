/** The brood's folder tree, its toolbar, and the right-click menu. */
import { For, Show } from "solid-js";

import { runCommand } from "../app/commands";
import { activeFilePath, brood, openFile } from "../app/state";
import { baseName, extension } from "../ipc";
import { showContextMenu } from "../ui/ContextMenu";
import Icon, { type IconName } from "../ui/Icon";
import type { MenuEntry } from "../ui/menus";
import {
  beginNewDir,
  beginNewFile,
  beginRename,
  cancelEdit,
  commitEdit,
  copyPath,
  deleteEntry,
  treeEdit,
} from "./ops";
import { collapseAll, refreshTree, toggleDirectory, treeRows } from "./store";
import type { TreeNode, TreeRow } from "./tree";
import "./FileTree.css";

function entryMenu(node: TreeNode): MenuEntry[] {
  const dir = node.isDirectory ? node.path : null;
  const items: MenuEntry[] = [];
  if (!node.isDirectory) {
    items.push({ kind: "action", label: "Open", run: () => openFile(node.path) });
    if (extension(node.path) === "py") {
      items.push({
        kind: "action",
        label: "Run File",
        run: async () => {
          await openFile(node.path);
          await runCommand("spawn.run");
        },
      });
    }
    items.push({ kind: "separator" });
  }
  if (dir) {
    items.push(
      { kind: "action", label: "New file here", run: () => beginNewFile(dir) },
      { kind: "action", label: "New folder here", run: () => beginNewDir(dir) },
      { kind: "separator" },
    );
  }
  items.push(
    { kind: "action", label: "Rename…", run: () => beginRename(node.path) },
    { kind: "action", label: "Delete…", run: () => deleteEntry(node.path, node.isDirectory) },
    { kind: "separator" },
    { kind: "action", label: "Copy path", run: () => copyPath(node.path) },
  );
  return items;
}

function rootMenu(root: string): MenuEntry[] {
  return [
    { kind: "action", label: "New file", run: () => beginNewFile(root) },
    { kind: "action", label: "New folder", run: () => beginNewDir(root) },
    { kind: "separator" },
    { kind: "action", label: "Refresh", run: refreshTree },
    { kind: "action", label: "Copy project path", run: () => copyPath(root) },
  ];
}

/** The inline text box for a new name. */
function EditRow(props: { depth: number }) {
  return (
    <div class="sp-tree-row is-editing" style={{ "--depth": props.depth }}>
      <span class="sp-tree-chevron" />
      <span class="sp-tree-icon">
        <Icon name={treeEdit()?.kind === "new-dir" ? "folder" : "file"} />
      </span>
      <input
        class="sp-tree-input"
        type="text"
        value={treeEdit()?.initial ?? ""}
        ref={(el) =>
          queueMicrotask(() => {
            el.focus();
            const dot = el.value.lastIndexOf(".");
            el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") void commitEdit(e.currentTarget.value);
          else if (e.key === "Escape") cancelEdit();
          else return;
          e.preventDefault();
        }}
        onBlur={cancelEdit}
      />
    </div>
  );
}

function Row(props: { row: TreeRow }) {
  const node = () => props.row.node;
  const isActive = () => activeFilePath() === node().path;
  const renaming = () => {
    const edit = treeEdit();
    return edit?.kind === "rename" && edit.path === node().path;
  };

  const activate = () => {
    if (node().isDirectory) void toggleDirectory(node().path);
    else void openFile(node().path);
  };

  return (
    <Show when={!renaming()} fallback={<EditRow depth={props.row.depth} />}>
      <div
        class="sp-tree-row"
        classList={{ "is-active": isActive(), "is-dir": node().isDirectory }}
        style={{ "--depth": props.row.depth }}
        role="treeitem"
        tabIndex={0}
        aria-expanded={node().isDirectory ? node().expanded : undefined}
        onClick={activate}
        onContextMenu={(e) => {
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, entryMenu(node()));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") activate();
          else if (e.key === "F2") beginRename(node().path);
          else if (e.key === "Delete") void deleteEntry(node().path, node().isDirectory);
          else return;
          e.preventDefault();
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
    </Show>
  );
}

function ToolButton(props: { icon: IconName; title: string; onClick: () => void }) {
  return (
    <button
      class="sp-tree-tool"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

/** Rows with the pending new-entry box inserted after its parent directory. */
function rowsWithEdit(root: string): Array<TreeRow | { edit: true; depth: number }> {
  const rows = treeRows();
  const edit = treeEdit();
  if (!edit || edit.kind === "rename") return rows;
  if (edit.path === root) return [{ edit: true, depth: 0 }, ...rows];
  const out: Array<TreeRow | { edit: true; depth: number }> = [];
  for (const row of rows) {
    out.push(row);
    if (row.node.path === edit.path) out.push({ edit: true, depth: row.depth + 1 });
  }
  return out;
}

export default function FileTree() {
  return (
    <div class="sp-tree" role="tree">
      <Show
        when={brood()}
        fallback={
          <div class="sp-tree-empty">
            <p>No project open.</p>
            <button class="sp-button" onClick={() => void runCommand("brood.open")}>
              Open a project
            </button>
          </div>
        }
      >
        {(root) => (
          <>
            <div
              class="sp-tree-header"
              onContextMenu={(e) => {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY, rootMenu(root()));
              }}
            >
              <span class="sp-tree-title" title={root()}>
                {baseName(root())}
              </span>
              <span class="sp-tree-tools">
                <ToolButton
                  icon="file-plus"
                  title="New file"
                  onClick={() => beginNewFile(root())}
                />
                <ToolButton
                  icon="folder-plus"
                  title="New folder"
                  onClick={() => beginNewDir(root())}
                />
                <ToolButton icon="refresh" title="Refresh" onClick={() => void refreshTree()} />
                <ToolButton icon="collapse" title="Collapse all" onClick={collapseAll} />
                <ToolButton
                  icon="folder-open"
                  title="Open another project"
                  onClick={() => void runCommand("brood.open")}
                />
              </span>
            </div>
            <div
              class="sp-tree-rows"
              onContextMenu={(e) => {
                if (e.target === e.currentTarget) {
                  e.preventDefault();
                  showContextMenu(e.clientX, e.clientY, rootMenu(root()));
                }
              }}
            >
              <For each={rowsWithEdit(root())}>
                {(row) => ("edit" in row ? <EditRow depth={row.depth} /> : <Row row={row} />)}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
