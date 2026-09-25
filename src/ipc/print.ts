/** Paper printing through the platform print dialog. */
import { invoke } from "@tauri-apps/api/core";

export function printPage(): Promise<void> {
  return invoke("print_page");
}
