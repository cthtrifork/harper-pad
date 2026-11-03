// A readout for sorting out how the installed app is laid out on a phone: tap the status bar five times in a row to show it, tap the
// readout to hide it. It measures what the page really gets (safe-area insets, display mode, sizes) instead of assuming, so a fix for
// the notch or the status bar can be based on numbers. Text only (no HTML is built from the values).
const TAPS = 5;
const WITHIN_MS = 2000;

// The page cannot read env() directly; an element padded by it can.
function insets() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const s = getComputedStyle(probe);
  const out = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => Math.round(Number.parseFloat(v)));
  probe.remove();
  return out;
}

function report() {
  const [t, r, b, l] = insets();
  const bar = document.querySelector(".bar")?.getBoundingClientRect();
  const vv = window.visualViewport;
  const style = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content ?? "-";
  return [
    `standalone: ${matchMedia("(display-mode: standalone)").matches} (navigator ${navigator.standalone ?? "n/a"})`,
    `status bar style meta: ${style}`,
    `insets t${t} r${r} b${b} l${l}`,
    `window ${innerWidth}x${innerHeight}, screen ${screen.width}x${screen.height}, dpr ${devicePixelRatio}`,
    `visualViewport ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} at ${Math.round(vv.offsetTop)}` : "n/a"}`,
    `header top ${bar ? Math.round(bar.top) : "-"}, height ${bar ? Math.round(bar.height) : "-"}`,
    `${matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}, ${matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape"}`,
  ].join("\n");
}

export function installDiagnostics() {
  let taps = [];
  let box = null;
  document.addEventListener("click", (event) => {
    if (box && event.target === box) {
      box.remove();
      box = null;
      return;
    }
    if (!event.target.closest?.(".status")) return;
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < WITHIN_MS), now];
    if (taps.length < TAPS) return;
    taps = [];
    box?.remove();
    box = document.createElement("pre");
    box.textContent = report();
    box.setAttribute("role", "status");
    box.style.cssText =
      "position:fixed;left:8px;right:8px;top:50%;margin:0;padding:10px;z-index:99;border-radius:8px;" +
      "background:rgb(0 0 0 / 0.88);color:#fff;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap";
    document.body.append(box);
  });
}
