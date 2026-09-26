/** Desktop notifications, with permission asked the first time it matters. */
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted: boolean | null = null;

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (granted === null) {
      granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
    }
    if (!granted) return;
    sendNotification({ title, body });
  } catch {
    // No notification daemon, or permission denied: not worth a croak.
  }
}
