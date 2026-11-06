import assert from "node:assert/strict";
import { test } from "node:test";
import { hintKind, isIOS, watchInstall } from "./installHint.js";

test("iPhone and iPad are recognised, including an iPad asking for the desktop site", () => {
  assert.equal(isIOS({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }), true);
  assert.equal(isIOS({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isIOS({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(isIOS({ userAgent: "Mozilla/5.0 (Linux; Android 14)" }), false);
});

test("nothing on the first visit, when installed, or once it was shown", () => {
  const base = { ios: true, standalone: false, visits: 2, shown: false, deferred: false };
  assert.equal(hintKind(base), "ios");
  assert.equal(hintKind({ ...base, visits: 1 }), null);
  assert.equal(hintKind({ ...base, standalone: true }), null);
  assert.equal(hintKind({ ...base, shown: true }), null);
  assert.equal(hintKind({ ...base, ios: false }), null);
  assert.equal(hintKind({ ...base, ios: false, deferred: true }), "install");
});

function env({ userAgent = "iPhone", standalone = false, data = null } = {}) {
  const store = new Map(data ? [["harper-pad.install", JSON.stringify(data)]] : []);
  const handlers = {};
  return {
    store,
    handlers,
    env: {
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
      navigator: { userAgent, standalone },
      win: { addEventListener: (t, fn) => (handlers[t] = fn), matchMedia: () => ({ matches: false }) },
    },
  };
}

test("the iPhone hint shows on the second visit, once", () => {
  const shown = [];
  const first = env();
  watchInstall({ show: (h) => shown.push(h), env: first.env }).ready();
  assert.equal(shown.length, 0);
  const second = env({ data: JSON.parse(first.store.get("harper-pad.install")) });
  watchInstall({ show: (h) => shown.push(h), env: second.env }).ready();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].kind, "ios");
  const third = env({ data: JSON.parse(second.store.get("harper-pad.install")) });
  watchInstall({ show: (h) => shown.push(h), env: third.env }).ready();
  assert.equal(shown.length, 1);
});

test("an install prompt becomes an Install button, and accepting runs it", async () => {
  const shown = [];
  const e = env({ userAgent: "Android", data: { visits: 1 } });
  const w = watchInstall({ show: (h) => shown.push(h), env: e.env });
  let prevented = false;
  let prompted = false;
  e.handlers.beforeinstallprompt({ preventDefault: () => (prevented = true), prompt: async () => (prompted = true) });
  w.ready();
  assert.equal(prevented, true);
  assert.equal(shown[0].kind, "install");
  await w.accept();
  assert.equal(prompted, true);
});
