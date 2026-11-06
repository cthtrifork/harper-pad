// What to paste into a bug report or a performance question from a phone, where there is no inspector: pressing the version in the drafts
// drawer copies it. Nothing here is sent anywhere, and it holds no draft text. The start-up timings are recorded by main.js and App.vue.

const recorded = {};

// Remember a number or text for the report (for example `record("openMs", 794)`).
export const record = (key, value) => {
  recorded[key] = value;
};

const ms = (v) => (typeof v === "number" ? `${Math.round(v)} ms` : "n/a");
const kb = (b) => (b ? `${Math.round(b / 1024)} kB` : "cached/0");

// The text of the report from plain facts: `info` is what collect() returns. Pure, so a test can check it.
export function formatDiagnostics(info) {
  const lines = [
    `Harper Pad ${info.version || "(no version)"}`,
    `When: ${info.when}`,
    `Agent: ${info.agent}`,
    `Standalone (home-screen app): ${info.standalone}`,
    `Service worker: ${info.worker}`,
    `Connection: ${info.connection}`,
    `Opened in: ${ms(info.openMs)} (reading the draft ${ms(info.dataMs)})`,
    `Harper started in: ${ms(info.setupMs)}`,
    `Page: response ${ms(info.responseEnd)}, DOM ready ${ms(info.domReady)}, load ${ms(info.load)}, first paint ${ms(info.firstPaint)}`,
  ];
  if (info.resources?.length) {
    lines.push("Slowest requests (start, duration, transferred):");
    for (const r of info.resources) lines.push(`  ${r.name}  ${ms(r.start)}, ${ms(r.duration)}, ${kb(r.size)}`);
  }
  return lines.join("\n");
}

// The facts of this page load, read from the browser. Each read is guarded: a browser without one of these APIs leaves it out.
export async function collect(version) {
  const nav = performance.getEntriesByType?.("navigation")?.[0];
  const paint = performance.getEntriesByName?.("first-paint")?.[0];
  const resources = (performance.getEntriesByType?.("resource") ?? [])
    .map((r) => ({
      name: new URL(r.name, location.href).pathname.split("/").pop() || "/",
      start: r.startTime,
      duration: r.duration,
      size: r.transferSize,
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 6);
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  const net = navigator.connection;
  return {
    version: version || (import.meta.env?.APP_VERSION ?? ""),
    when: new Date().toISOString(),
    agent: navigator.userAgent,
    standalone: !!navigator.standalone || !!matchMedia("(display-mode: standalone)").matches,
    worker: registration
      ? `${registration.active ? "active" : "installing"}, ${navigator.serviceWorker.controller ? "controls this page" : "not controlling this page"}`
      : "none",
    connection: net ? `${net.effectiveType ?? "?"}, ${net.downlink ?? "?"} Mbit/s, ${net.rtt ?? "?"} ms rtt` : "unknown",
    openMs: recorded.openMs,
    dataMs: recorded.dataMs,
    setupMs: recorded.setupMs,
    responseEnd: nav?.responseEnd,
    domReady: nav?.domContentLoadedEventEnd,
    load: nav?.loadEventEnd || undefined,
    firstPaint: paint?.startTime,
    resources,
  };
}

// Copy the report; true when it reached the clipboard.
export async function copyDiagnostics(version) {
  try {
    await navigator.clipboard.writeText(formatDiagnostics(await collect(version)));
    return true;
  } catch {
    return false;
  }
}
