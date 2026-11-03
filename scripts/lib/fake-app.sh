# Sourced by screenshots.sh and lighthouse.sh: run the headless server build (no GTK, no window).
# The version is stamped (a fixed, release-shaped v1.2.3, so the top bar button reads like a real build) and demo mode (a development build only) fixes the status bar's timings,
# so the footer reads the same on every machine and run.

fake_app_build() {
  make frontend
  CGO_ENABLED=0 go build -tags server -ldflags "-X github.com/cthtrifork/harper-pad/internal/app.version=v1.2.3" -o "$1/app" .
}

fake_app_start() {
  local dir="$1" port="$2"

  # Real code throughout: a SQLite database under XDG_DATA_HOME, and files saved under $HOME/Documents (the demo has no save
  # dialog). HOME is set so the folder reads "~/Documents" on every machine.
  HARPER_PAD_DEMO=1 \
    HARPER_PAD_DEMO_SAVE_DIR="$dir/home/Documents" \
    HOME="$dir/home" \
    XDG_CACHE_HOME="$dir/cache" \
    XDG_CONFIG_HOME="$dir/config" \
    XDG_DATA_HOME="$dir/data" \
    WAILS_SERVER_HOST=127.0.0.1 \
    WAILS_SERVER_PORT="$port" \
    "$dir/app" >"$dir/app.log" 2>&1 &
  echo $! >"$dir/app.pid"

  for _ in $(seq 1 50); do
    curl -fsS -o /dev/null "http://127.0.0.1:${port}/" 2>/dev/null && return 0
    sleep 0.2
  done
  cat "$dir/app.log" >&2
  echo "app did not answer on port $port" >&2
  return 1
}

fake_app_stop() {
  [ -f "$1/app.pid" ] && kill "$(cat "$1/app.pid")" 2>/dev/null || true
}
