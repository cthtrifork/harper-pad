import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { applyUpdate, onUpdateReady, registerWorker, resetForTests } from "./swUpdate.js";

const events = () => {
  const map = {};
  return {
    map,
    addEventListener: (t, fn) => {
      (map[t] ??= []).push(fn);
    },
    emit: (t) => {
      for (const fn of map[t] ?? []) fn();
    },
  };
};

function setup({ controller = {}, waiting = null } = {}) {
  const posted = [];
  const reg = Object.assign(events(), { waiting, installing: null, update: async () => {} });
  const sw = Object.assign(events(), { controller, register: async () => reg });
  const doc = Object.assign(events(), { visibilityState: "visible" });
  let reloads = 0;
  let t = 0;
  return {
    reg,
    sw,
    doc,
    posted,
    reloads: () => reloads,
    opts: { sw, doc, reload: () => reloads++, now: () => t },
    tick: (ms) => (t += ms),
  };
}

beforeEach(resetForTests);

test("a waiting worker while one controls the page is an update", async () => {
  const s = setup({ waiting: { postMessage() {} } });
  let ready = 0;
  onUpdateReady(() => ready++);
  await registerWorker("sw.js", s.opts);
  assert.equal(ready, 1);
});

test("the first install is not an update", async () => {
  const s = setup({ controller: null, waiting: { postMessage() {} } });
  let ready = 0;
  onUpdateReady(() => ready++);
  await registerWorker("sw.js", s.opts);
  const worker = Object.assign(events(), { state: "installing" });
  s.reg.installing = worker;
  s.reg.emit("updatefound");
  worker.state = "installed";
  worker.emit("statechange");
  assert.equal(ready, 0);
});

test("a new worker that finishes installing is an update", async () => {
  const s = setup();
  let ready = 0;
  onUpdateReady(() => ready++);
  await registerWorker("sw.js", s.opts);
  const worker = Object.assign(events(), { state: "installing" });
  s.reg.installing = worker;
  s.reg.emit("updatefound");
  worker.state = "installed";
  worker.emit("statechange");
  assert.equal(ready, 1);
});

test("applying tells the worker to take over and reloads once it has", async () => {
  const posted = [];
  const s = setup({ waiting: { postMessage: (m) => posted.push(m) } });
  await registerWorker("sw.js", s.opts);
  applyUpdate();
  assert.deepEqual(posted, [{ type: "skip-waiting" }]);
  assert.equal(s.reloads(), 0);
  s.sw.emit("controllerchange");
  s.sw.emit("controllerchange");
  assert.equal(s.reloads(), 1);
});

test("coming back to the front checks for a new worker at most once an hour", async () => {
  const s = setup();
  let updates = 0;
  s.reg.update = async () => void updates++;
  await registerWorker("sw.js", s.opts);
  s.doc.emit("visibilitychange");
  assert.equal(updates, 0);
  s.tick(61 * 60 * 1000);
  s.doc.emit("visibilitychange");
  s.doc.emit("visibilitychange");
  assert.equal(updates, 1);
});

test("a browser without service workers is left alone", async () => {
  await registerWorker("sw.js", { sw: undefined });
});
