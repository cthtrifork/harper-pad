import "@fontsource-variable/literata";
import { createApp } from "vue";
import App from "./App.vue";
import { isWeb } from "./lib/backend.js";
import "./styles/index.css";

createApp(App).mount("#app");

// The web build works offline after the first load (public/sw.js). The desktop build has no service worker.
if (isWeb && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
