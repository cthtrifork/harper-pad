import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import wails from "@wailsio/runtime/plugins/vite";
import { defineConfig } from "vite";

// Vite empties dist/ on every build. The Go side embeds it, so `go vet` and `go test` need the
// directory to exist even when nobody has built the frontend; keep the committed placeholder.
const keepPlaceholder = () => ({
  name: "keep-dist-placeholder",
  closeBundle() {
    writeFileSync("dist/.gitkeep", "");
  },
});

// The Content-Security-Policy of the production page. It lets the page load only its own files and nothing else:
//   - script-src: our scripts; 'wasm-unsafe-eval' only so Harper's WebAssembly can be compiled (no 'unsafe-eval', no inline scripts);
//   - style-src: 'unsafe-inline' is needed because CodeMirror and Vue write style attributes and <style> elements at run time;
//   - worker-src: Harper runs in a Web Worker, which may be a blob: URL;
//   - connect-src: calls to the Go side (same origin) and nothing on the internet;
//   - object-src, base-uri, form-action: off.
// A <meta> tag is the one form every webview (WebKitGTK, WebView2) applies to the document. It is added to production builds
// only, so the dev server's hot reload (inline scripts, a websocket) keeps working. See docs/security.md.
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// The web build (GitHub Pages, `vite build --mode web`) gets the same policy plus one directive: the page loads its own web app
// manifest, which `default-src 'none'` would otherwise block. The desktop policy is unchanged.
const WEB_POLICY = `${POLICY}; manifest-src 'self'`;

const contentSecurityPolicy = (policy) => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
  ],
});

// What makes the web build an installable offline app: the manifest, the service worker and the icons in web/, copied to the
// site root, plus the <head> tags that point at them. The desktop build has none of it (its page would load nothing from them, and
// its policy has no manifest-src), so desktop dist/ and index.html stay as they were.
const WEB_DIR = fileURLToPath(new URL("./web", import.meta.url));

const webApp = () => {
  let base = "/";
  return {
    name: "web-app",
    configResolved: (config) => {
      base = config.base;
    },
    generateBundle() {
      for (const name of readdirSync(WEB_DIR)) {
        this.emitFile({ type: "asset", fileName: name, source: readFileSync(path.join(WEB_DIR, name)) });
      }
    },
    transformIndexHtml: () => [
      // `default`: the status bar is a strip of its own with text that follows light and dark, and the page starts below it. `black` was
      // tried on an iPhone and looked the same in the dark scheme (the blur at the top of the header is iOS's, see styles/safe-area.css),
      // but would be a black strip over the light header. black-translucent is avoided: its text is always white.
      // viewport-fit=cover (index.html) and the safe-area insets (styles/safe-area.css) still keep the page clear of the notch, the
      // home indicator and, in landscape, the sides. theme-color follows the header colour (--panel) for Android and Safari's own bar.
      { tag: "meta", attrs: { name: "theme-color", content: "#eceff3", media: "(prefers-color-scheme: light)" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "theme-color", content: "#181d23", media: "(prefers-color-scheme: dark)" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" }, // older iOS only knows this one
      { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Harper Pad" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "apple-touch-icon", href: `${base}apple-touch-icon.png` }, injectTo: "head" },
      { tag: "link", attrs: { rel: "manifest", href: `${base}manifest.webmanifest` }, injectTo: "head" },
    ],
  };
};

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    // On <owner>.github.io Pages serves the site from /<repo>/ (the default here); on a custom domain it is at "/". CI sets BASE_PATH
    // from the Pages settings (pages.yml), so the deployed site is always right. Set it by hand for a local build under another path.
    base: web ? process.env.BASE_PATH || "/harper-pad/" : "/",
    // The web build goes to its own folder so it never empties frontend/dist, which the Go side embeds.
    build: web ? { outDir: "dist-web" } : undefined,
    server: {
      host: "127.0.0.1",
      port: Number(process.env.WAILS_VITE_PORT) || 9245,
      strictPort: true,
    },
    // The harper.js worker is an ES module; the default "iife" worker format cannot code-split it.
    worker: { format: "es" },
    // The web build has no Go side: no Wails plugin, and no dist/ placeholder to keep.
    plugins: web
      ? [vue(), contentSecurityPolicy(WEB_POLICY), webApp()]
      : [vue(), wails("./bindings"), contentSecurityPolicy(POLICY), keepPlaceholder()],
  };
});
