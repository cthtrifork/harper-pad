import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDiagnostics, noteOpen } from "./diagnostics.js";

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("the report is one line of JSON with Prometheus-style names and base units", () => {
  const text = formatDiagnostics({
    version: "v1.2.3",
    at: 1_793_980_721_073,
    standalone: true,
    worker: false,
    opens: { count: 1, first: 1_793_980_717_697, previous: 0 },
    openMs: 520.4,
    dataMs: 50,
    setupMs: 2594,
    net: { type: "4g", mbit: 1.35, rtt: 100 },
    storage: { usage: 20_328_793, quota: 10_757_747_033, persisted: false },
    resources: [{ name: "harper.wasm", duration: 7000.2, size: 8_388_608 }],
    agent: "UA",
  });
  assert.ok(!text.includes("\n"));
  assert.deepEqual(JSON.parse(text), {
    version: "v1.2.3",
    user_agent: "UA",
    timestamp_seconds: 1_793_980_721.073,
    standalone: 1,
    open_total: 1,
    first_open_timestamp_seconds: 1_793_980_717.697,
    mount_duration_seconds: 0.52,
    draft_read_duration_seconds: 0.05,
    harper_start_duration_seconds: 2.594,
    service_worker_controlling: 0,
    network_downlink_megabits_per_second: 1.35,
    network_rtt_seconds: 0.1,
    storage_usage_bytes: 20_328_793,
    storage_quota_bytes: 10_757_747_033,
    storage_persisted: 0,
    slow_requests: [{ name: "harper.wasm", duration_seconds: 7, transfer_bytes: 8_388_608 }],
  });
});

test("what the browser cannot tell is left out", () => {
  const report = JSON.parse(formatDiagnostics({ version: "", at: 1000, standalone: false, agent: "UA" }));
  assert.deepEqual(report, { user_agent: "UA", timestamp_seconds: 1, standalone: 0 });
});

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
