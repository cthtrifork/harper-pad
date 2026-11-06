// What to paste into a bug report or a performance question from a phone, where there is no inspector: pressing the version in the drafts
// drawer copies it. Nothing here is sent anywhere, and it holds no draft text. The start-up timings are recorded by main.js and App.vue.

const recorded = {};

// Remember a number or text for the report (for example `record("openMs", 794)`).
export const record = (key, value) => {
  recorded[key] = value;
};

// Counts the opens in this browser storage, so a report says whether it comes from the first open (the cold one). localStorage is
// cleared together with the rest when iOS drops a home-screen app's storage, so the count starts again then, which is the point.
const OPENS = "harper-pad-opens";
export function noteOpen(now = Date.now(), store = globalThis.localStorage) {
  let seen = { count: 0, first: now, last: 0 };
  try {
    seen = { ...seen, ...JSON.parse(store.getItem(OPENS) ?? "{}") };
  } catch {
    // unreadable: start counting again
  }
  const before = seen;
  try {
    store.setItem(OPENS, JSON.stringify({ count: before.count + 1, first: before.first, last: now }));
  } catch {
    // storage full or blocked: the report says so (opens n/a)
  }
  recorded.opens = { count: before.count + 1, first: before.first, previous: before.last };
}

const ago = (then, now) => {
  const s = Math.max(0, Math.round((now - then) / 1000));
  return s < 90
    ? `${s} s`
    : s < 5400
      ? `${Math.round(s / 60)} min`
      : s < 129600
        ? `${Math.round(s / 3600)} h`
        : `${Math.round(s / 86400)} days`;
};
const mb = (b) => (typeof b === "number" ? `${Math.round(b / 1048576)} MB` : "n/a");
const ms = (v) => (typeof v === "number" ? `${Math.round(v)} ms` : "n/a");
const kb = (b) => (b ? `${Math.round(b / 1024)} kB` : "cached");

// The text of the report from plain facts: `info` is what collect() returns. Mostly numbers on a few lines, so it is quick to read and
// to compare between runs. Pure, so a test can check it.
export function formatDiagnostics(info) {
  const opens = info.opens
    ? info.opens.count === 1
      ? "open #1 (first)"
      : `open #${info.opens.count} (first ${ago(info.opens.first, info.nowMs)} ago, last ${ago(info.opens.previous, info.nowMs)} ago)`
    : "opens n/a";
  const lines = [
    `Harper Pad ${info.version || "(no version)"} | ${info.standalone ? "home-screen app" : "browser tab"} | ${opens} | ${info.when}`,
    `opened ${ms(info.openMs)} (draft ${ms(info.dataMs)}) | first paint ${ms(info.firstPaint)} | page response ${ms(info.responseEnd)}, load ${ms(info.load)} | Harper ${ms(info.setupMs)}`,
    `worker ${info.worker} | net ${info.connection} | storage ${info.storage}`,
  ];
  if (info.resources?.length) lines.push(`slowest: ${info.resources.map((r) => `${r.name} ${ms(r.duration)}/${kb(r.size)}`).join(", ")}`);
  lines.push(info.agent);
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
    .slice(0, 3);
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  const net = navigator.connection;
  const storage = navigator.storage;
  const [persisted, estimate] = await Promise.all([
    storage?.persisted?.().catch(() => undefined),
    storage?.estimate?.().catch(() => undefined),
  ]);
  return {
    nowMs: Date.now(),
    opens: recorded.opens,
    storage: storage ? `${mb(estimate?.usage)}/${mb(estimate?.quota)}${persisted ? " persisted" : ""}` : "n/a",
    version: version || (import.meta.env?.APP_VERSION ?? ""),
    when: new Date().toISOString(),
    agent: navigator.userAgent,
    standalone: !!navigator.standalone || !!matchMedia("(display-mode: standalone)").matches,
    worker: registration ? (navigator.serviceWorker.controller ? "controlling" : "not controlling") : "none",
    connection: net ? `${net.effectiveType ?? "?"} ${net.downlink ?? "?"} Mbit/s ${net.rtt ?? "?"} ms` : "n/a",
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
