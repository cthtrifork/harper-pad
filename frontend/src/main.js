import "@fontsource-variable/literata";
import { createApp } from "vue";
import App from "./App.vue";
import { isWeb, startup } from "./lib/backend.js";
import { noteOpen, record } from "./lib/diagnostics.js";
import "./styles/index.css";

// Ask the backend what the editor needs (the demo banner and the most recent draft) before mounting, so the first paint already has
// the editor with its text: no empty editor that fills in afterwards, and no layout shift. It is one call to the Go side, or one read
// of IndexedDB, and the window already has its background colour while it waits.
// The two timings go into the diagnostics report (lib/diagnostics.js, copied from the version in the drafts drawer or the update popup):
// how long the first draft took to read, and how long since the navigation began until the editor was mounted.
const dataStart = performance.now();
const start = await startup().catch((err) => ({ demo: "", open: null, total: 0, error: String(err?.message || err) }));
// iOS only applies :active (the press feedback on buttons) once a touch listener exists.
document.addEventListener("touchstart", () => {}, { passive: true });
const dataMs = Math.round(performance.now() - dataStart);
noteOpen();
record("dataMs", dataMs);
record("openMs", Math.round(performance.now()));
createApp(App, { start }).mount("#app");

// The web build works offline after the first load (public/sw.js). The desktop build has no service worker.
if (isWeb && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
