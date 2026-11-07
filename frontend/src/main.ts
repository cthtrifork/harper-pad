import "@fontsource-variable/literata";
import { createApp } from "vue";
import App from "./App.vue";
import { isWeb, startup } from "./lib/backend.ts";
import { noteOpen, record } from "./lib/diagnostics.ts";
import "./styles/index.css";

// The backend is asked before mounting, so the first paint already has the editor with its text: no empty editor that fills in
// afterwards, and no layout shift. The two timings go into the diagnostics report (lib/diagnostics.ts).
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
