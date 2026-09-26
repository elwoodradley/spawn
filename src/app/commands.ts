/**
 * Command registry. Every user-triggerable action is a command with an id,
 * a title for the palette, and optionally a key chord. Menus, buttons and
 * keybindings all go through `runCommand`, so there is one place to look
 * when asking "what can this app do".
 */
export interface Command {
  /** Dotted, stable, lower-case: `spawn.run`, `brood.open`. */
  id: string;
  /** Shown in the command palette. */
  title: string;
  /** A chord like `Mod-S` or `Shift-F5`. See `keybindings.ts` for syntax. */
  keys?: string;
  /** Return false to hide from the palette and ignore the chord. */
  enabled?: () => boolean;
  /** Keep the chord working but leave it out of the palette (key aliases). */
  hidden?: boolean;
  run: () => void | Promise<void>;
}

const registry = new Map<string, Command>();

export function registerCommand(command: Command): () => void {
  registry.set(command.id, command);
  return () => {
    registry.delete(command.id);
  };
}

export function registerCommands(commands: readonly Command[]): () => void {
  const disposers = commands.map(registerCommand);
  return () => disposers.forEach((d) => d());
}

export function getCommand(id: string): Command | undefined {
  return registry.get(id);
}

export function listCommands(): Command[] {
  return [...registry.values()].filter((c) => c.enabled?.() ?? true);
}

export async function runCommand(id: string): Promise<boolean> {
  const command = registry.get(id);
  if (!command || command.enabled?.() === false) return false;
  await command.run();
  return true;
}

/** For tests. */
export function clearCommands(): void {
  registry.clear();
}
