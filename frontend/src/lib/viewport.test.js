import assert from "node:assert/strict";
import { test } from "node:test";
import { keyboardState, trackKeyboard } from "./viewport.js";

test("a keyboard takes a large part of the height", () => {
  assert.deepEqual(keyboardState({ layoutHeight: 844, height: 508 }), { open: true, height: 336 });
});

test("the browser's toolbar changing is not a keyboard", () => {
  assert.deepEqual(keyboardState({ layoutHeight: 844, height: 780 }), { open: false, height: 0 });
});

test("a page that Safari scrolled still counts the covered part", () => {
  assert.deepEqual(keyboardState({ layoutHeight: 844, height: 508, top: 100 }), { open: true, height: 236 });
});

function fake({ layoutHeight, height, offsetTop = 0 }) {
  const listeners = {};
  const classes = new Set();
  const props = new Map();
  const scrolls = [];
  const vv = {
    height,
    offsetTop,
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
  };
  return {
    vv,
    listeners,
    classes,
    props,
    scrolls,
    win: { innerHeight: layoutHeight, visualViewport: vv, scrollTo: (...a) => scrolls.push(a) },
    root: {
      style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c) },
    },
  };
}

test("the keyboard opening sets --vvh and the class, and closing removes them", () => {
  const f = fake({ layoutHeight: 844, height: 844 });
  const seen = [];
  const stop = trackKeyboard({ root: f.root, win: f.win, onChange: (o) => seen.push(o) });
  assert.equal(f.classes.has("keyboard"), false);
  f.vv.height = 508;
  f.listeners.resize();
  assert.equal(f.props.get("--vvh"), "508px");
  assert.equal(f.classes.has("keyboard"), true);
  f.vv.height = 844;
  f.listeners.resize();
  assert.equal(f.props.has("--vvh"), false);
  assert.deepEqual(seen, [true, false]);
  stop();
  assert.deepEqual(Object.keys(f.listeners), []);
});

test("Safari scrolling the page while the keyboard is up is undone", () => {
  const f = fake({ layoutHeight: 844, height: 508, offsetTop: 40 });
  trackKeyboard({ root: f.root, win: f.win });
  assert.deepEqual(f.scrolls, [[0, 0]]);
});

test("a browser without visualViewport is left alone", () => {
  const stop = trackKeyboard({ win: {}, root: {} });
  assert.equal(typeof stop, "function");
});
