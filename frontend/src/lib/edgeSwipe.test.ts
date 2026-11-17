import assert from "node:assert/strict";
import test from "node:test";
import { attachEdgeSwipe, classifySwipe, OPEN_DISTANCE } from "./edgeSwipe.ts";

test("a small move waits, a vertical one is ignored, a rightward one swipes", () => {
  assert.equal(classifySwipe(3, 4), "wait");
  assert.equal(classifySwipe(4, 30), "ignore");
  assert.equal(classifySwipe(-30, 4), "ignore");
  assert.equal(classifySwipe(30, 8), "swipe");
});

function fake(enabled = true) {
  const target = new EventTarget();
  let opened = 0;
  attachEdgeSwipe(target, { enabled: () => enabled, open: () => opened++ });
  const fire = (type: string, x: number, y: number, extra = {}) => {
    const e = Object.assign(new Event(type), { pointerType: "touch", isPrimary: true, pointerId: 1, clientX: x, clientY: y }, extra);
    target.dispatchEvent(e);
  };
  return { fire, opened: () => opened };
}

test("a swipe from the edge opens once", () => {
  const t = fake();
  t.fire("pointerdown", 5, 200);
  t.fire("pointermove", 30, 205);
  t.fire("pointermove", 5 + OPEN_DISTANCE, 206);
  t.fire("pointermove", 120, 206);
  assert.equal(t.opened(), 1);
});

test("a vertical drag, a mouse or a disabled state do nothing", () => {
  const vertical = fake();
  vertical.fire("pointerdown", 5, 200);
  vertical.fire("pointermove", 10, 260);
  vertical.fire("pointermove", 100, 262);
  assert.equal(vertical.opened(), 0);

  const mouse = fake();
  mouse.fire("pointerdown", 5, 200, { pointerType: "mouse" });
  mouse.fire("pointermove", 100, 200, { pointerType: "mouse" });
  assert.equal(mouse.opened(), 0);

  const off = fake(false);
  off.fire("pointerdown", 5, 200);
  off.fire("pointermove", 100, 200);
  assert.equal(off.opened(), 0);
});
