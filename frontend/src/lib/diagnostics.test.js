import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDiagnostics, noteOpen } from "./diagnostics.js";

const base = {
  version: "v1.2.3",
  when: "2026-11-06T10:00:00.000Z",
  agent: "UA",
  standalone: true,
  worker: "active, controls this page",
  connection: "4g, 10 Mbit/s, 50 ms rtt",
};

test("the report names the version, the timings and the slowest requests", () => {
  const text = formatDiagnostics({
    ...base,
    openMs: 3200.4,
    dataMs: 1900,
    setupMs: 2300,
    responseEnd: 400,
    resources: [{ name: "harper.wasm", start: 900, duration: 7000.2, size: 8 * 1024 * 1024 }],
  });
  assert.match(text, /^Harper Pad v1\.2\.3/);
  assert.match(text, /Opened in: 3200 ms \(reading the draft 1900 ms\)/);
  assert.match(text, /Harper started in: 2300 ms/);
  assert.match(text, /harper\.wasm {2}900 ms, 7000 ms, 8192 kB/);
});

test("what the browser cannot tell is n/a, and a build with no version says so", () => {
  const text = formatDiagnostics({ ...base, version: "" });
  assert.match(text, /^Harper Pad \(no version\)/);
  assert.match(text, /Opened in: n\/a/);
  assert.doesNotMatch(text, /Slowest requests/);
});

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("the first open is counted as the first, and later ones count on", () => {
  const store = memory();
  noteOpen(1000, store);
  assert.deepEqual(JSON.parse(store.getItem("harper-pad-opens")), { count: 1, first: 1000, last: 1000 });
  noteOpen(5000, store);
  assert.deepEqual(JSON.parse(store.getItem("harper-pad-opens")), { count: 2, first: 1000, last: 5000 });
});

test("storage that cannot be read or written does not stop the app", () => {
  noteOpen(1, {
    getItem: () => "{broken",
    setItem: () => {
      throw new Error("full");
    },
  });
});

test("the report says whether this is the first open and how storage stands", () => {
  const first = formatDiagnostics({
    ...base,
    nowMs: 10_000,
    opens: { count: 1, first: 10_000, previous: 0 },
    storage: "not persisted, 1.0 MB of 500.0 MB",
  });
  assert.match(first, /Opens in this storage: 1 \(the first\)/);
  assert.match(first, /Storage: not persisted, 1\.0 MB of 500\.0 MB/);
  const later = formatDiagnostics({
    ...base,
    nowMs: 3 * 3600_000,
    opens: { count: 4, first: 0, previous: 3600_000 },
    storage: "persisted",
  });
  assert.match(later, /Opens in this storage: 4, first 3 h ago, previous 2 h ago/);
});
