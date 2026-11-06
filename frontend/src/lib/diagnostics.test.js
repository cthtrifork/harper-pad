import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDiagnostics, noteOpen } from "./diagnostics.js";

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("the report is one line of JSON with raw rounded numbers", () => {
  const text = formatDiagnostics({
    version: "v1.2.3",
    at: 1000,
    standalone: true,
    opens: { count: 1, first: 1000, previous: 0 },
    openMs: 3200.4,
    dataMs: 1900,
    setupMs: 2300,
    resources: [{ name: "harper.wasm", duration: 7000.2, size: 8388608 }],
    agent: "UA",
  });
  assert.ok(!text.includes("\n"));
  assert.deepEqual(JSON.parse(text), {
    version: "v1.2.3",
    at: 1000,
    standalone: true,
    opens: { count: 1, first: 1000, previous: 0 },
    openMs: 3200,
    draftMs: 1900,
    harperMs: 2300,
    slowest: [{ name: "harper.wasm", ms: 7000, bytes: 8388608 }],
    agent: "UA",
  });
});

test("what the browser cannot tell is left out", () => {
  const report = JSON.parse(formatDiagnostics({ version: "", at: 1, standalone: false, agent: "UA" }));
  assert.deepEqual(report, { at: 1, standalone: false, agent: "UA" });
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
