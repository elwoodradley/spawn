/**
 * Toasts: short notices that need no answer. The store lives here so any
 * module can raise one; `ui/Toast.tsx` draws them.
 */
import { createSignal } from "solid-js";

export type ToastKind = "info" | "success" | "croak";

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** Milliseconds before auto-dismiss; croaks stay longer by default. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT: Record<ToastKind, number> = { info: 2500, success: 2500, croak: 7000 };
const MAX_VISIBLE = 5;

const [toasts, setToasts] = createSignal<readonly Toast[]>([]);
export { toasts };

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function toast(message: string, options: ToastOptions = {}): number {
  const kind = options.kind ?? "info";
  const id = nextId++;
  setToasts((list) => [...list, { id, message, kind }].slice(-MAX_VISIBLE));
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT[kind];
  if (timeout > 0)
    timers.set(
      id,
      setTimeout(() => dismissToast(id), timeout),
    );
  return id;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  setToasts((list) => list.filter((t) => t.id !== id));
}

/** Shorthand for errors surfaced to the user. */
export function croakToast(message: string): number {
  return toast(message, { kind: "croak" });
}
