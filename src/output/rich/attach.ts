/**
 * The one place the pool's event stream meets the output model. Call once at
 * startup; every rich payload the pool emits becomes a block in the console.
 */
import { onPoolEvent } from "../../pool/client";
import type { OutputModel } from "../../spawn/output";

export function attachPoolEvents(model: OutputModel): () => void {
  return onPoolEvent((event) => model.appendRich(event.payload, event.exec));
}
