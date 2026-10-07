/**
 * Run a child process to completion with its output buffered, off to the
 * side of the Run controller: the Output panel and Metrics never see it.
 * stdin is closed straight away so `input()` raises EOFError instead of
 * waiting. A time limit and an AbortSignal both end in `kill()`.
 *
 * `spawn` is injectable so tests can drive it without Tauri.
 */
import { spawnProcess, type ProcEvent, type ProcHandle, type SpawnRequest } from "../ipc";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  cancelled: boolean;
  /** Set when the process could not be started at all. */
  startFailure: string | null;
}

export interface RunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  /** Keep at most this many characters per stream (the head is kept). */
  maxChars?: number;
  spawn?: (request: SpawnRequest, onEvent: (event: ProcEvent) => void) => Promise<ProcHandle>;
}

const DEFAULT_MAX_CHARS = 200_000;
const PY_ENV = { PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" };

export function runToCompletion(request: SpawnRequest, options: RunOptions): Promise<RunResult> {
  const spawn = options.spawn ?? spawnProcess;
  const max = options.maxChars ?? DEFAULT_MAX_CHARS;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let handle: ProcHandle | null = null;
    let timedOut = false;
    let cancelled = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (code: number | null, startFailure: string | null = null) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, code, timedOut, cancelled, startFailure });
    };
    const kill = () => {
      handle?.kill().catch(() => {
        /* the exit event still arrives, or never started */
      });
    };
    const onAbort = () => {
      cancelled = true;
      if (handle) kill();
      else finish(null);
    };
    const append = (current: string, text: string) =>
      current.length >= max ? current : (current + text).slice(0, max);

    const onEvent = (event: ProcEvent) => {
      switch (event.kind) {
        case "stdout":
          stdout = append(stdout, event.text);
          break;
        case "stderr":
          stderr = append(stderr, event.text);
          break;
        case "croak":
          stderr = append(stderr, `${event.message}\n`);
          break;
        case "exit":
          finish(event.code);
          break;
        case "started":
          break;
      }
    };

    if (options.signal?.aborted) {
      cancelled = true;
      finish(null);
      return;
    }
    options.signal?.addEventListener("abort", onAbort);
    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);

    spawn({ ...request, env: { ...PY_ENV, ...request.env } }, onEvent)
      .then((h) => {
        handle = h;
        // The time limit or Cancel may have fired while the start was pending.
        if (cancelled || timedOut) {
          kill();
          return;
        }
        h.closeStdin().catch(() => {
          /* already exited */
        });
      })
      .catch((err: unknown) => {
        finish(null, err instanceof Error ? err.message : String(err));
      });
  });
}
