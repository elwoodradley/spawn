/**
 * Which nudge is showing. Re-evaluated after every Interactive Console run;
 * "Later" hides an id for this session, "Dismiss" remembers it in settings.
 */
import { createEffect, createRoot, createSignal, on } from "solid-js";

import { settings, updateSettings } from "../app/settings";
import { memory, mlInfo } from "../env/store";
import { poolStatus } from "../pool/client";
import { onExecFinished } from "../pool/hooks";
import { evaluateNudges, pickNudge, type Nudge } from "./rules";

const [current, setCurrent] = createSignal<Nudge | null>(null);
export { current as currentNudge };

const snoozed = new Set<string>();

export function snoozeNudge(id: string): void {
  snoozed.add(id);
  setCurrent(null);
}

export function dismissNudge(id: string): void {
  snoozed.add(id);
  setCurrent(null);
  const dismissed = settings().nudges.dismissed;
  if (dismissed.includes(id)) return;
  void updateSettings({ nudges: { dismissed: [...dismissed, id] } });
}

export function installNudges(): () => void {
  const unsubscribe = onExecFinished(({ variables }) => {
    const candidates = evaluateNudges({ variables, ml: mlInfo(), memory: memory() });
    setCurrent(pickNudge(candidates, settings().nudges.dismissed, snoozed));
  });
  const dispose = createRoot((disposeRoot) => {
    createEffect(
      on(
        poolStatus,
        (status) => {
          if (status === "cold" || status === "croaked") setCurrent(null);
        },
        { defer: true },
      ),
    );
    return disposeRoot;
  });
  return () => {
    unsubscribe();
    dispose();
    setCurrent(null);
  };
}
