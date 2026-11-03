# Security

Harper Pad is a local desktop app with no accounts, no server and no network use beyond the update check. This page says what is
protected and how, and what is not.

## Where the trust boundaries are

- The **webview** (the page) is our own code, loaded from files embedded in the exe. It talks to the Go side only through the Wails
  bindings of the services in `internal/app`.
- The **Go side** validates everything the page sends (it never trusts the frontend, as Wails' own binding guidance says) and is the only
  code that touches the database or the update download.
- Text the user types or pastes is **data**. It is never run, never used to build SQL, and never put into the page as HTML.

## SQL injection

Covered; see [storage](storage.md#rules). Every value is a `?` parameter, all SQL lives in `internal/store`, and the frontend can only call
specific service methods.

## Cross-site scripting and the Content-Security-Policy

- Vue and CodeMirror put text into the page as text. The frontend has no `v-html`, `innerHTML`, `eval` or `new Function`.
- The markdown preview (`components/Preview.vue`) uses `marked` only to parse into tokens, and turns the tokens into Vue elements, so no
  HTML string is ever built. Raw HTML in a draft is shown as text, images as their alt text, and only `http(s):` and `mailto:` links
  are links; they carry no `href`, so a click cannot navigate the window away.
- **We do not HTML-escape text before saving it**, which Wails' security guide suggests for web-style comments. Escaping on save would
  corrupt drafts (`<` stored as `&lt;`) and still not be the right place to defend. The defence is at the point of rendering, where the
  framework escapes.
- As a second layer, the production page carries a `Content-Security-Policy` (a `<meta>` tag that `frontend/vite.config.js` adds to
  `vite build`, not to the dev server):

  | Directive | Value | Why |
  |---|---|---|
  | `default-src` | `'none'` | nothing is allowed unless listed |
  | `script-src` | `'self' 'wasm-unsafe-eval'` | our scripts only; `'wasm-unsafe-eval'` lets Harper's WebAssembly compile. No inline scripts and no `'unsafe-eval'` |
  | `style-src` | `'self' 'unsafe-inline'` | CodeMirror and Vue write style attributes and `<style>` elements at run time |
  | `img-src` / `font-src` | `'self'` (images also `data:`) | |
  | `connect-src` | `'self'` | calls to the Go side, and nothing on the internet |
  | `worker-src` | `'self' blob:` | Harper runs in a Web Worker |
  | `object-src`, `base-uri`, `form-action` | `'none'` | |
  | `manifest-src` | `'self'`, **web build only** | the GitHub Pages build loads its own web app manifest ([`pages.md`](pages.md)); the desktop policy does not have it |

- Limits: a `<meta>` policy cannot set `frame-ancestors` or report violations, and the Web Worker script is a same-origin file, so it
  is covered only if it is created from a `blob:` URL (it is). If a webview ever refuses `'wasm-unsafe-eval'`, Harper will not start
  and the browser console shows the violation; relaxing that one directive is the only fix.

## The other OWASP Top 10 areas (2021 names)

| Area | State |
|---|---|
| Broken access control | No users. In the release app the bindings are reachable only from the app's own window. The dev/CI server mode (`-tags server`, not in releases) serves the same calls over HTTP on localhost; Wails 3.1.0 guards it: `/wails/runtime` takes only POSTs from its own origin (`Origin` and `Sec-Fetch-Site` are checked), the WebSocket is same-origin unless `WebSocketOriginPatterns` or `WebSocketAllowAllOrigins` say otherwise, and a loopback bind rejects an unexpected `Host` header (DNS rebinding). So a web page open in the user's browser cannot call the bindings. What it does not have is authentication: a non-browser client on the same machine (no `Origin`, no `Sec-Fetch-Site`) is allowed, so run server mode only on a machine you trust, and never set `WebSocketAllowAllOrigins`. |
| Cryptographic failures | No secrets are handled. Drafts and settings are plain text in a file readable only by the user (mode 0600 on Linux; the user's profile on Windows). The app does not encrypt them; use disk encryption for sensitive notes. |
| Insecure design | Inputs are bounded (5 MB per draft, 10,000 dictionary words, strict ids and formats). |
| Security misconfiguration | The Wails MCP server and the pprof endpoint are refused in production builds (`mcp_guard.go`, `pprof_guard.go`) and CI greps the binary for them. The Content-Security-Policy above. |
| Vulnerable and outdated components | `govulncheck` runs before every release, Trivy and CodeQL on pull requests, Renovate keeps modules and actions current, and each release has an SBOM. |
| Authentication failures | Not applicable. |
| Software and data integrity | The updater only installs a release that lists a SHA-256 for the file (it refuses one without), from `api.github.com`. That detects corruption, not a hostile release: see [self-update](self-update.md#security). Releases carry signed attestations, the Linux packages are signed, GitHub Actions are pinned by commit, and the Windows exe is signed once SignPath is set up ([windows](windows.md#code-signing)). |
| Logging and monitoring | Logs hold paths and errors, never draft text. |
| Server-side request forgery | The only outbound request is the update check, fixed to GitHub. The "What is new" link is a fixed `github.com` URL (the latest release page). |

## What Wails' own documentation says

Wails (`guides/security`, `features/bindings/best-practices`) recommends validating all input on the Go side, paginating large results,
descriptive errors, and keeping services focused. We follow all four: `internal/app` has a service each for the drafts (`DraftService`), the settings (`SettingsService`) and the updater
(`UpdateService`), and a small `PadService` for startup and the version. The guides do not mention a
Content-Security-Policy, and Wails does not set one itself, so the policy above is ours.
