import assert from "node:assert/strict";
import test from "node:test";
import { attachPullToRefresh, MAX, pullDistance, SLOP, THRESHOLD } from "./pullToRefresh.ts";

test("the pull has resistance, never goes negative and stops at the maximum", () => {
  assert.equal(pullDistance(-20), 0);
  assert.equal(pullDistance(60), 30);
  assert.equal(pullDistance(1000), MAX);
});

function fake(opts: { enabled?: boolean; atTop?: boolean } = {}) {
  const target = new EventTarget();
  const log: string[] = [];
  let prevented = 0;
  attachPullToRefresh(target, {
    enabled: () => opts.enabled ?? true,
    atTop: () => opts.atTop ?? true,
    move: (d, armed) => log.push(`move ${d}${armed ? " armed" : ""}`),
    end: (armed) => log.push(`end ${armed}`),
  });
  const fire = (type: string, ...pts: [number, number][]) => {
    const e = Object.assign(new Event(type, { cancelable: true }), { touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })) });
    const pd = e.preventDefault.bind(e);
    e.preventDefault = () => {
      prevented++;
      pd();
    };
    target.dispatchEvent(e);
  };
  return { fire, log, prevented: () => prevented };
}

test("a pull past the threshold arms, and letting go syncs", () => {
  const t = fake();
  t.fire("touchstart", [100, 100]);
  t.fire("touchmove", [100, 105]); // still waiting
  t.fire("touchmove", [100, 100 + SLOP + 40]);
  t.fire("touchmove", [100, 100 + SLOP + THRESHOLD * 2]);
  t.fire("touchend");
  assert.deepEqual(t.log, ["move 20", `move ${THRESHOLD} armed`, "end true"]);
  assert.equal(t.prevented(), 2); // the browser's own scroll is held off while pulling
});

test("letting go before the threshold, or a cancelled touch, does not sync", () => {
  const short = fake();
  short.fire("touchstart", [100, 100]);
  short.fire("touchmove", [100, 100 + SLOP + 40]);
  short.fire("touchend");
  assert.deepEqual(short.log, ["move 20", "end false"]);

  const cancelled = fake();
  cancelled.fire("touchstart", [100, 100]);
  cancelled.fire("touchmove", [100, 100 + SLOP + 200]);
  cancelled.fire("touchcancel");
  assert.deepEqual(cancelled.log, [`move ${MAX} armed`, "end false"]);
});

test("a scroll up, a sideways drag, two fingers, a scrolled editor or a disabled state do nothing", () => {
  const up = fake();
  up.fire("touchstart", [100, 100]);
  up.fire("touchmove", [100, 60]);
  up.fire("touchmove", [100, 200]);
  up.fire("touchend");
  assert.deepEqual(up.log, []);

  const side = fake();
  side.fire("touchstart", [100, 100]);
  side.fire("touchmove", [140, 110]);
  side.fire("touchmove", [140, 300]);
  assert.deepEqual(side.log, []);

  const two = fake();
  two.fire("touchstart", [100, 100], [200, 100]);
  two.fire("touchmove", [100, 300], [200, 300]);
  assert.deepEqual(two.log, []);

  const scrolled = fake({ atTop: false });
  scrolled.fire("touchstart", [100, 100]);
  scrolled.fire("touchmove", [100, 300]);
  assert.deepEqual(scrolled.log, []);

  const off = fake({ enabled: false });
  off.fire("touchstart", [100, 100]);
  off.fire("touchmove", [100, 300]);
  assert.deepEqual(off.log, []);
  assert.equal(off.prevented(), 0);
});
