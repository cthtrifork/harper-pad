// A diagnostics report to paste into a bug report or a performance question: pressing the version copies it. One line of JSON with raw
// numbers (milliseconds, bytes, epoch milliseconds), to be read by whoever gets it. Nothing here is sent anywhere, and it holds no draft text.
// The start-up timings are recorded by main.js and App.vue.

const recorded = {};

// Remember a number for the report (for example `record("openMs", 794)`).
export const record = (key, value) => {
  recorded[key] = value;
};

// Counts the opens in this browser storage, so a report says whether it comes from the first open (the cold one). localStorage is cleared
// together with the rest when iOS drops a home-screen app's storage, so the count starts again then, which is the point.
const OPENS = "harper-pad-opens";
export function noteOpen(now = Date.now(), store = globalThis.localStorage) {
  let seen = { count: 0, first: now, last: 0 };
  try {
    seen = { ...seen, ...JSON.parse(store.getItem(OPENS) ?? "{}") };
  } catch {
    // unreadable: start counting again
  }
  try {
    store.setItem(OPENS, JSON.stringify({ count: seen.count + 1, first: seen.first, last: now }));
  } catch {
    // storage full or blocked: the report carries the count anyway
  }
  recorded.opens = { count: seen.count + 1, first: seen.first, previous: seen.last };
}

const round = (v) => (typeof v === "number" ? Math.round(v) : undefined);

// The report as one line of JSON, from what collect() returns. Undefined values (what the browser cannot tell) drop out.
export const formatDiagnostics = (info) =>
  JSON.stringify({
    version: info.version || undefined,
    at: info.at,
    standalone: info.standalone,
    opens: info.opens,
    openMs: round(info.openMs),
    draftMs: round(info.dataMs),
    harperMs: round(info.setupMs),
    paintMs: round(info.firstPaint),
    responseMs: round(info.responseEnd),
    loadMs: round(info.load),
    worker: info.worker,
    net: info.net,
    storage: info.storage,
    slowest: info.resources?.map((r) => ({ name: r.name, ms: round(r.duration), bytes: r.size })),
    agent: info.agent,
  });

// The facts of this page load, read from the browser. Each read is guarded: a browser without one of these APIs leaves it out.
export async function collect(version) {
  const nav = performance.getEntriesByType?.("navigation")?.[0];
  const paint = performance.getEntriesByName?.("first-paint")?.[0];
  const resources = (performance.getEntriesByType?.("resource") ?? [])
    .map((r) => ({ name: new URL(r.name, location.href).pathname.split("/").pop() || "/", duration: r.duration, size: r.transferSize }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3);
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  const net = navigator.connection;
  const storage = navigator.storage;
  const [persisted, estimate] = await Promise.all([
    storage?.persisted?.().catch(() => undefined),
    storage?.estimate?.().catch(() => undefined),
  ]);
  return {
    version: version || (import.meta.env?.APP_VERSION ?? ""),
    at: Date.now(),
    agent: navigator.userAgent,
    standalone: !!navigator.standalone || !!matchMedia("(display-mode: standalone)").matches,
    worker: registration ? !!navigator.serviceWorker.controller : undefined, // true: the service worker controls this page
    net: net ? { type: net.effectiveType, mbit: net.downlink, rtt: net.rtt } : undefined,
    storage: estimate ? { usage: estimate.usage, quota: estimate.quota, persisted } : undefined,
    opens: recorded.opens,
    openMs: recorded.openMs,
    dataMs: recorded.dataMs,
    setupMs: recorded.setupMs,
    responseEnd: nav?.responseEnd,
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
