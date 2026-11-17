// What to tell the person when a sync they asked for (the Sync button, or a pull on the editor) did not go through. Their drafts are
// always kept on the device, so the wording says so. `synced` has no message of its own: the status line already says it.

export const OFFLINE_TEXT = "Offline. Saved here, will sync when back";
export const LOCAL_TEXT = "Sync is off. Drafts stay on this device";

export function failureText(status: string, error = ""): string {
  if (status === "offline") return OFFLINE_TEXT;
  if (status === "signin") return "Signed out. Paste a new invite link in the Sync chip";
  if (status === "pending") return error || "Sync did not finish. Try again";
  return "";
}
