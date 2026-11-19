import assert from "node:assert/strict";
import test from "node:test";
import { attachEdgeSwipe, classifySwipe, shouldOpen, SLOP } from "./edgeSwipe.ts";

test("a small move waits, a vertical one is ignored, a rightward one swipes", () => {
  assert.equal(classifySwipe(3, 4), "wait");
  assert.equal(classifySwipe(4, 30), "ignore");
  assert.equal(classifySwipe(-30, 4), "ignore");
  assert.equal(classifySwipe(30, 8), "swipe");
});

test("letting go past a third of the width opens, before it closes", () => {
  assert.equal(shouldOpen(130, 390), true);
  assert.equal(shouldOpen(129, 390), false);
  assert.equal(shouldOpen(0, 390), false);
});

function fake(enabled = true, taps: string[] = []) {
  const target = new EventTarget();
  const log: string[] = [];
  attachEdgeSwipe(target, {
    enabled: () => enabled,
    start: () => log.push("start"),
    move: (dx) => log.push(`move ${dx}`),
    end: (dx, cancelled) => log.push(`end ${dx}${cancelled ? " cancelled" : ""}`),
    tap: (x, y) => taps.push(`${x},${y}`),
  });
  const fire = (type: string, x: number, y: number, extra = {}) => {
    target.dispatchEvent(
      Object.assign(new Event(type), { pointerType: "touch", isPrimary: true, pointerId: 1, clientX: x, clientY: y }, extra),
    );
  };
  return { fire, log };
}

test("the drawer follows the finger from the moment it is a swipe, and the release reports the distance", () => {
  const t = fake();
  t.fire("pointerdown", 5, 200);
  t.fire("pointermove", 8, 201); // still waiting
  t.fire("pointermove", 5 + SLOP + 40, 205);
  t.fire("pointermove", 5 + SLOP + 90, 206);
  t.fire("pointerup", 5 + SLOP + 90, 206);
  assert.deepEqual(t.log, ["start", "move 40", "move 90", "end 90"]);
});

test("a cancelled touch reports it", () => {
  const t = fake();
  t.fire("pointerdown", 5, 200);
  t.fire("pointermove", 60, 202);
  t.fire("pointercancel", 60, 202);
  assert.deepEqual(t.log, ["start", `move ${55 - SLOP}`, `end ${55 - SLOP} cancelled`]);
});

test("a vertical drag, a mouse or a disabled state do nothing", () => {
  const vertical = fake();
  vertical.fire("pointerdown", 5, 200);
  vertical.fire("pointermove", 10, 260);
  vertical.fire("pointermove", 100, 262);
  vertical.fire("pointerup", 100, 262);
  assert.deepEqual(vertical.log, []);

  const mouse = fake();
  mouse.fire("pointerdown", 5, 200, { pointerType: "mouse" });
  mouse.fire("pointermove", 100, 200, { pointerType: "mouse" });
  assert.deepEqual(mouse.log, []);

  const off = fake(false);
  off.fire("pointerdown", 5, 200);
  off.fire("pointermove", 100, 200);
  assert.deepEqual(off.log, []);
});

test("a plain tap is handed on, so the caret can be placed under the strip", () => {
  const taps: string[] = [];
  const t = fake(true, taps);
  t.fire("pointerdown", 20, 200);
  t.fire("pointermove", 22, 201);
  t.fire("pointerup", 22, 201);
  assert.deepEqual(taps, ["22,201"]);
  assert.deepEqual(t.log, []);
});

test("a swipe or a vertical scroll is not a tap", () => {
  const taps: string[] = [];
  const t = fake(true, taps);
  t.fire("pointerdown", 5, 200);
  t.fire("pointermove", 60, 202);
  t.fire("pointerup", 60, 202);
  t.fire("pointerdown", 5, 200);
  t.fire("pointermove", 6, 260);
  t.fire("pointerup", 6, 260);
  assert.deepEqual(taps, []);
});
