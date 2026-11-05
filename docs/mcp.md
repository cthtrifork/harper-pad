# LLM control (MCP)

Wails v3 has a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that lets an agent (Claude Code, an IDE assistant, any MCP client) inspect and drive a **running** copy of the app: list windows, query the DOM, evaluate JavaScript, click and type with an animated cursor, call bound Go methods and emit or await events. Upstream guide: <https://v3.wails.io/guides/mcp-service/> (marked experimental; the API may change).

It is a **development and testing aid**. This repo never ships it.

## Turning it on

The server is compiled in only with the `mcp` build tag and starts inside `app.Run()`. No code in this repo registers it.

```sh
make run-mcp            # desktop app: go run -tags mcp . (needs GTK4 + WebKitGTK 6)
make run-mcp-server     # headless app: CGO_ENABLED=0 go run -tags server,mcp .
WAILS_MCP=1 wails3 dev  # the CLI adds the tag for you
```

The log prints `MCP server started ... url=http://127.0.0.1:9099/mcp`. Add the server to Claude Code (the repo's `.mcp.json` already declares it as `harper-pad`, so Claude Code only asks you to approve it):

```sh
claude mcp add --transport http harper-pad http://127.0.0.1:9099/mcp
```

Then ask, for example: *"Take a DOM snapshot of the main window"* or *"Type a sentence with a mistake into the editor and list what Harper reports."*

## Settings

All environment variables, read by Wails (`WAILS_MCP_*`); nothing is configured in this repo.

| Variable | Default | Meaning |
|---|---|---|
| `WAILS_MCP` | unset | `1`/`true`/`on`/`yes`: the Wails CLI adds the `mcp` tag |
| `WAILS_MCP_HOST` | `127.0.0.1` | Bind address. Anything but loopback requires `WAILS_MCP_TOKEN`, otherwise startup fails |
| `WAILS_MCP_PORT` | `9099` | `0` picks a free port (printed in the log) |
| `WAILS_MCP_TOKEN` | unset | Bearer token (`Authorization: Bearer <token>`); optional on loopback |
| `WAILS_MCP_TIMEOUT` | `30000` | JavaScript evaluation timeout in ms |
| `WAILS_MCP_HIDE_CURSOR` | unset | `1`/`true` hides the animated cursor |

## Tools

`app_info`, `windows_list`, `window_control`, `js_eval`, `dom_html`, `dom_query`, `screenshot_dom`, `mouse_move`, `mouse_click`, `mouse_drag`, `mouse_scroll`, `keyboard_type`, `keyboard_press`, `call_bound_method`, `emit_event`, `wait_for_event` (16 in `v3.0.0-beta.34`). `call_bound_method` names methods as `main.PadService.<Method>`, for example `main.PadService.Version`; the exported methods are in `internal/app/service.go`.

## Headless mode: what works

Checked against `v3.0.0-beta.34` with `-tags server,mcp`: the server starts and the HTTP/JSON-RPC layer works, but server mode has no native webview. `app_info`, `windows_list` and `emit_event` answer; every tool that runs JavaScript in a window (`dom_*`, `js_eval`, `mouse_*`, `keyboard_*`, `call_bound_method`, `wait_for_event`) times out with *"waiting for the page to respond"*. A browser opened on the headless port is not attached to the MCP server. To drive the UI use the desktop build, or Playwright against the headless server.

## Security

Anyone who can reach the port can read the DOM, run JavaScript in the app and call the services (`PadService`, `DraftService`, `SettingsService`, `UpdateService`).

- Binds to `127.0.0.1`; browser origins must be loopback. Without a token every local process is trusted, so on a shared machine set `WAILS_MCP_TOKEN` (and put the same token in the client's `Authorization` header).
- Do not set `WAILS_MCP_HOST=0.0.0.0`. If you ever must, use a token and an encrypted tunnel.
