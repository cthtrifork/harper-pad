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

const seconds = (ms) => (typeof ms === "number" ? Math.round(ms) / 1000 : undefined);
const bit = (v) => (v === undefined ? undefined : v ? 1 : 0);

// The report as one line of JSON, from what collect() returns. The names follow Prometheus conventions (snake_case, base units in the name,
// booleans as 0 or 1, timestamps in seconds), so the same fields can become metrics if they are ever collected. Values the browser cannot
// give drop out. `service_worker_controlling` 0 with a registration is normal on the very first open.
export const formatDiagnostics = (info) =>
  JSON.stringify({
    version: info.version || undefined,
    user_agent: info.agent,
    timestamp_seconds: seconds(info.at),
    standalone: bit(info.standalone),
    open_total: info.opens?.count,
    first_open_timestamp_seconds: seconds(info.opens?.first),
    last_open_timestamp_seconds: info.opens?.previous ? seconds(info.opens.previous) : undefined,
    mount_duration_seconds: seconds(info.openMs), // from the start of the page load until the editor was mounted; includes the draft read
    draft_read_duration_seconds: seconds(info.dataMs),
    harper_start_duration_seconds: seconds(info.setupMs),
    first_paint_duration_seconds: seconds(info.firstPaint),
    page_response_duration_seconds: seconds(info.responseEnd),
    page_load_duration_seconds: seconds(info.load),
    service_worker_controlling: bit(info.worker),
    network_downlink_megabits_per_second: info.net?.mbit,
    network_rtt_seconds: seconds(info.net?.rtt),
    storage_usage_bytes: info.storage?.usage,
    storage_quota_bytes: info.storage?.quota,
    storage_persisted: bit(info.storage?.persisted),
    slow_requests: info.resources?.map((r) => ({ name: r.name, duration_seconds: seconds(r.duration), transfer_bytes: r.size })), // transfer_bytes 0: from cache
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
