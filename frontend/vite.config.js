import { writeFileSync } from "node:fs";
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

const contentSecurityPolicy = () => ({
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: POLICY }, injectTo: "head-prepend" },
  ],
});

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  // The harper.js worker is an ES module; the default "iife" worker format cannot code-split it.
  worker: { format: "es" },
  plugins: [vue(), wails("./bindings"), contentSecurityPolicy(), keepPlaceholder()],
});
