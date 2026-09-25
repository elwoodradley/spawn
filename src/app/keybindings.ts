/**
 * Key chords for commands.
 *
 * Chord syntax is CodeMirror's: modifiers joined by `-` then the key, e.g.
 * `Mod-S`, `Shift-F5`, `Ctrl-Shift-P`. `Mod` is Ctrl on Linux and Windows and
 * Cmd on macOS. Key names are `KeyboardEvent.key` values, compared
 * case-insensitively, with `Space` as a readable alias for " ".
 */
import { listCommands, runCommand } from "./commands";

export interface Chord {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export function isMac(platform: string = navigator.platform): boolean {
  return /mac|iphone|ipad/i.test(platform);
}

export function parseChord(chord: string, mac = isMac()): Chord {
  const parts = chord.split("-");
  const key = parts.pop() ?? "";
  const out: Chord = {
    key: key === "Space" ? " " : key.toLowerCase(),
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  };
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case "mod":
        if (mac) out.meta = true;
        else out.ctrl = true;
        break;
      case "ctrl":
      case "control":
        out.ctrl = true;
        break;
      case "shift":
        out.shift = true;
        break;
      case "alt":
      case "option":
        out.alt = true;
        break;
      case "meta":
      case "cmd":
      case "win":
        out.meta = true;
        break;
      default:
        throw new Error(`unknown modifier "${part}" in chord "${chord}"`);
    }
  }
  return out;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export function matchesChord(chord: Chord, event: KeyLike): boolean {
  return (
    event.key.toLowerCase() === chord.key &&
    event.ctrlKey === chord.ctrl &&
    event.shiftKey === chord.shift &&
    event.altKey === chord.alt &&
    event.metaKey === chord.meta
  );
}

/** Human label for the status bar and palette: `Ctrl+S`, `⌘S`. */
export function chordLabel(chord: string, mac = isMac()): string {
  const parsed = parseChord(chord, mac);
  const keyName =
    parsed.key === " " ? "Space" : parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  if (mac) {
    return [parsed.ctrl && "⌃", parsed.alt && "⌥", parsed.shift && "⇧", parsed.meta && "⌘", keyName]
      .filter(Boolean)
      .join("");
  }
  return [
    parsed.ctrl && "Ctrl",
    parsed.alt && "Alt",
    parsed.shift && "Shift",
    parsed.meta && "Win",
    keyName,
  ]
    .filter(Boolean)
    .join("+");
}

/**
 * Listen for chords on the window and dispatch to commands. Commands whose
 * chord matches run even when focus is in the editor, because the editor's
 * own keymap gets the event first and calls `preventDefault` for the keys it
 * owns; we skip those.
 */
export function installKeybindings(target: Window = window): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    for (const command of listCommands()) {
      if (!command.keys) continue;
      if (matchesChord(parseChord(command.keys), event)) {
        event.preventDefault();
        void runCommand(command.id);
        return;
      }
    }
  };
  target.addEventListener("keydown", handler);
  return () => target.removeEventListener("keydown", handler);
}
