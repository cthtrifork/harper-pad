import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDiagnostics } from "./diagnostics.js";

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
