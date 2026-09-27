/**
 * Status bar: the environment awareness strip. Brood and spawn state on the
 * left; cursor, ML stack, device, memory, interpreter, uv, and theme on the
 * right. Everything here is always visible, never buried in a popup.
 */
import { Show } from "solid-js";

import { runCommand } from "../app/commands";
import { brood } from "../app/state";
import { cursorPosition } from "../editor/documents";
import Metamorphosis from "../env/Metamorphosis";
import {
  interpreterInfo,
  memory,
  mlError,
  mlInfo,
  mlProbing,
  refreshMlInfo,
  selectedCandidate,
  selectedInterpreter,
  SOURCE_LABELS,
  toggleMetamorphosis,
  uvAvailable,
} from "../env/store";
import { baseName, type MlInfo } from "../ipc";
import { formatBytes } from "../output/chart";
import { poolStatus } from "../pool/client";
import { lspDetail, lspStatus } from "../lsp/server";
import { poolClickCommand, poolLabel, poolTitle } from "../pool/status";
import { elapsedMs, outcome, spawnStatus } from "../spawn/controller";
import { currentTheme } from "../theme/store";
import FindInFiles from "./FindInFiles";
import QuickOpen from "./QuickOpen";
import "./StatusBar.css";

/** `2.9.0+cu126` -> `2.9` */
export function shortVersion(version: string): string {
  const [core] = version.split("+");
  return (core ?? version).split(".").slice(0, 2).join(".");
}

export function shortDeviceName(name: string): string {
  return name
    .replace(/^NVIDIA\s+/i, "")
    .replace(/^GeForce\s+/i, "")
    .trim();
}

export function torchLabel(info: MlInfo): string {
  if (!info.torch) return "";
  const parts = [`torch ${shortVersion(info.torch)}`];
  if (info.device) parts.push(info.device);
  if (info.device === "cuda") {
    if (info.deviceName) parts.push(shortDeviceName(info.deviceName));
    if (info.gpuMemUsed !== null && info.gpuMemTotal !== null) {
      parts.push(`${formatBytes(info.gpuMemUsed)}/${formatBytes(info.gpuMemTotal)} GB`);
    }
  }
  return parts.join(" · ");
}

function mlTitle(info: MlInfo): string {
  const lines = [
    `numpy ${info.numpy ?? "not installed"}`,
    `pandas ${info.pandas ?? "not installed"}`,
    `torch ${info.torch ?? "not installed"}`,
    `jax ${info.jax ?? "not installed"}`,
  ];
  if (info.torch) {
    lines.push(`device ${info.device ?? "?"}${info.deviceName ? ` (${info.deviceName})` : ""}`);
    if (info.cuda) lines.push(`cuda ${info.cuda}`);
  }
  return `${lines.join("\n")}\nClick to re-probe`;
}

export default function StatusBar() {
  const spawnLabel = () => {
    if (spawnStatus() === "running") return `running · ${(elapsedMs() / 1000).toFixed(1)}s`;
    switch (outcome()) {
      case "ok":
        return "run finished";
      case "croak":
        return "run failed";
      case "stopped":
        return "run stopped";
      default:
        return "idle";
    }
  };

  const interpreterLabel = () => {
    const path = selectedInterpreter();
    if (!path) return "no Python";
    const info = interpreterInfo();
    const source = selectedCandidate()?.source;
    const version = info ? `Python ${info.version}` : baseName(path);
    return source ? `${version} · ${SOURCE_LABELS[source]}` : version;
  };

  return (
    <footer class="sp-statusbar sp-no-print" classList={{ [`is-${outcome()}`]: true }}>
      <div class="sp-statusbar__group">
        <button
          class="sp-statusbar__item sp-statusbar__button"
          title={brood() ? `${brood()}\nClick to open another project` : "Open a project"}
          onClick={() => void runCommand("brood.open")}
        >
          {brood() ? baseName(brood() ?? "") : "no project"}
        </button>
        <button
          class="sp-statusbar__item sp-statusbar__button sp-statusbar__pool"
          classList={{ [`is-${poolStatus()}`]: true }}
          title={poolTitle()}
          onClick={() => void runCommand(poolClickCommand())}
        >
          <span class="sp-statusbar__dot" aria-hidden="true" />
          {poolLabel()}
        </button>
        <button
          class="sp-statusbar__item sp-statusbar__button sp-statusbar__lsp"
          classList={{ [`is-${lspStatus()}`]: true }}
          title={`pyright: ${lspStatus()}${lspDetail() ? `\n${lspDetail()}` : ""}\nClick to restart`}
          onClick={() =>
            void runCommand(lspStatus() === "missing" ? "settings.open" : "lsp.restart")
          }
        >
          <span class="sp-statusbar__dot" aria-hidden="true" />
          {`pyright: ${lspStatus()}`}
        </button>
        <button
          class="sp-statusbar__item sp-statusbar__button sp-statusbar__spawn"
          classList={{ "is-running": spawnStatus() === "running" }}
          title="Toggle the output panel"
          onClick={() => void runCommand("view.toggleOutput")}
        >
          {spawnLabel()}
        </button>
      </div>
      <div class="sp-statusbar__group">
        <Show when={cursorPosition()}>
          {(pos) => (
            <button
              class="sp-statusbar__item sp-statusbar__button"
              title="Go to line"
              onClick={() => void runCommand("edit.gotoLine")}
            >
              Ln {pos().line}, Col {pos().col}
            </button>
          )}
        </Show>
        <MlItems />
        <Show when={memory()}>
          {(mem) => (
            <span class="sp-statusbar__item" title="System memory used / total">
              mem {formatBytes(mem().used)}/{formatBytes(mem().total)} GB
            </span>
          )}
        </Show>
        <button
          class="sp-statusbar__item sp-statusbar__button"
          title={`${selectedInterpreter() ?? "No interpreter selected"}\nClick to select a Python interpreter`}
          onClick={() => toggleMetamorphosis()}
        >
          {interpreterLabel()}
        </button>
        <Show when={uvAvailable()}>
          {(uv) => (
            <span class="sp-statusbar__item sp-statusbar__badge" title={uv()}>
              uv
            </span>
          )}
        </Show>
        <button
          class="sp-statusbar__item sp-statusbar__button"
          title="Cycle theme"
          onClick={() => void runCommand("theme.cycle")}
        >
          {currentTheme().name}
        </button>
      </div>
      <Metamorphosis />
      <QuickOpen />
      <FindInFiles />
    </footer>
  );
}

function MlItems() {
  return (
    <>
      <Show when={mlProbing()}>
        <span
          class="sp-statusbar__item sp-statusbar__probing"
          title="Asking the interpreter about its ML packages"
        >
          <span class="sp-statusbar__spinner" /> probing
        </span>
      </Show>
      <Show when={!mlProbing() && mlError()}>
        {(err) => (
          <button
            class="sp-statusbar__item sp-statusbar__button is-warning"
            title={`${err()}\nClick to retry`}
            onClick={() => void refreshMlInfo()}
          >
            ml ?
          </button>
        )}
      </Show>
      <Show when={!mlProbing() && mlInfo()}>
        {(info) => (
          <>
            <Show when={info().numpy}>
              {(v) => (
                <span class="sp-statusbar__item" title={mlTitle(info())}>
                  numpy {shortVersion(v())}
                </span>
              )}
            </Show>
            <button
              class="sp-statusbar__item sp-statusbar__button"
              title={mlTitle(info())}
              onClick={() => void refreshMlInfo()}
            >
              <Show
                when={info().torch}
                fallback={info().jax ? `jax ${shortVersion(info().jax ?? "")}` : "no torch"}
              >
                {torchLabel(info())}
              </Show>
            </button>
          </>
        )}
      </Show>
    </>
  );
}
