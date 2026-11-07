import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import wails from "@wailsio/runtime/plugins/vite";
import { defineConfig } from "vite";
import { buildPolicy, syncOriginOf } from "./src/lib/csp.ts";

// Vite empties dist/ on every build. The Go side embeds it, so `go vet` and `go test` need the
// directory to exist even when nobody has built the frontend; keep the committed placeholder.
const keepPlaceholder = () => ({
  name: "keep-dist-placeholder",
  closeBundle() {
    writeFileSync("dist/.gitkeep", "");
  },
});

// The Content-Security-Policy of the production page is built in src/lib/csp.ts (see docs/security.md). SYNC_ORIGIN, the sync server's
// https origin, is added to connect-src when it is set (docs/sync.md) and the policy is unchanged when it is not. A <meta> tag is the one
// form every webview applies. Production only, so the dev server's hot reload keeps working. The web build (GitHub Pages) adds manifest-src.
const POLICY = buildPolicy({ syncOrigin: process.env.SYNC_ORIGIN });
const WEB_POLICY = buildPolicy({ web: true, syncOrigin: process.env.SYNC_ORIGIN });

const contentSecurityPolicy = (policy) => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
  ],
});

// The splash in index.html paints before the bundled stylesheet has arrived, so it cannot read the tokens from it. Rather than copy
// the colours there, the tokens are inlined into <head> from the one file that defines them (the stylesheet still loads them as usual).
const inlineTokens = () => ({
  name: "inline-tokens",
  transformIndexHtml: () => [
    {
      tag: "style",
      children: readFileSync(new URL("./src/styles/tokens.css", import.meta.url), "utf8"),
      injectTo: "head-prepend",
    },
  ],
});

// What makes the web build an installable offline app: the manifest, the service worker and the icons in web/, copied to the
// site root, plus the <head> tags that point at them. The desktop build has none of it (its page would load nothing from them, and
// its policy has no manifest-src), so desktop dist/ and index.html stay as they were.
// The status-bar colour of each scheme is the header's --panel in styles/tokens.css, read from there instead of copied: the first
// --panel in the file is the light one, the second (inside the prefers-color-scheme: dark block) the dark one.
const [LIGHT_PANEL, DARK_PANEL] = [
  ...readFileSync(new URL("./src/styles/tokens.css", import.meta.url), "utf8").matchAll(/--panel:\s*(#[0-9a-f]{3,8});/gi),
].map((m) => m[1]);

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
      // `default`: the status bar gets its own strip that follows light and dark (`black` would sit over the light header).
      // The safe-area insets (styles/safe-area.css) keep the page clear of the notch and home indicator.
      { tag: "meta", attrs: { name: "theme-color", content: LIGHT_PANEL, media: "(prefers-color-scheme: light)" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "theme-color", content: DARK_PANEL, media: "(prefers-color-scheme: dark)" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" }, // older iOS only knows this one
      { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Harper Pad" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "apple-touch-icon", href: `${base}apple-touch-icon.png` }, injectTo: "head" },
      { tag: "link", attrs: { rel: "manifest", href: `${base}manifest.webmanifest` }, injectTo: "head" },
    ],
  };
};

// The desktop build has no wasm (src/lib/core.js is the web build's Go logic; on desktop Go answers directly), so there it imports a stub and
// the bundle carries no wasm file. Only imports from src/ are swapped, never a package's own core.js.
const desktopCore = () => ({
  name: "desktop-core",
  enforce: "pre",
  resolveId(source, importer) {
    if (importer && !importer.includes("node_modules") && /(^|\/)core\.js$/.test(source)) {
      return fileURLToPath(new URL("./src/lib/core.desktop.js", import.meta.url));
    }
  },
});

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
    // The page reads the sync server's origin to know whether sync is set up at all (src/lib/useSync.js); empty hides it.
    // APP_VERSION is the release tag of the web build (pages.yml); empty in a preview or a local build, and then nothing is shown.
    define: {
      "import.meta.env.SYNC_ORIGIN": JSON.stringify(syncOriginOf(process.env.SYNC_ORIGIN)),
      "import.meta.env.APP_VERSION": JSON.stringify(web ? (process.env.APP_VERSION ?? "") : ""),
    },
    // The harper.js worker is an ES module; the default "iife" worker format cannot code-split it.
    worker: { format: "es" },
    // The web build has no Go side: no Wails plugin, and no dist/ placeholder to keep.
    plugins: web
      ? [vue(), inlineTokens(), contentSecurityPolicy(WEB_POLICY), webApp()]
      : [vue(), wails("./bindings"), inlineTokens(), contentSecurityPolicy(POLICY), keepPlaceholder(), desktopCore()],
  };
});
