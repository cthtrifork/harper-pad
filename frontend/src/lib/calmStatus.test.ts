import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";
import { type Line, SETTLE_MS, SLOW_MS, useCalmStatus } from "./calmStatus.ts";

function setup(initial: Line = { text: "", tone: "mute" }) {
  const source = ref<Line>(initial);
  const busy = ref(false);
  const line = useCalmStatus(source, busy);
  return { source, busy, line };
}

test("typing shows nothing: the in-between states never appear", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, busy, line } = setup();
  for (const text of ["Unsaved changes", "Saving...", "Syncing...", "Saved and synced"]) {
    busy.value = text !== "Saved and synced";
    source.value = { text, tone: text === "Saved and synced" ? "ok" : "mute" };
    t.mock.timers.tick(100);
    assert.equal(line.value.text, "");
  }
});

test("the outcome appears once the line has been still", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, line } = setup();
  source.value = { text: "Saved and synced", tone: "ok" };
  t.mock.timers.tick(SETTLE_MS - 1);
  assert.equal(line.value.text, "");
  t.mock.timers.tick(1);
  assert.deepEqual(line.value, { text: "Saved and synced", tone: "ok" });
});

test("a new edit clears the old outcome instead of leaving it stale", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, line } = setup();
  source.value = { text: "Saved and synced", tone: "ok" };
  t.mock.timers.tick(SETTLE_MS);
  source.value = { text: "Unsaved changes", tone: "mute" };
  assert.equal(line.value.text, "");
});

test("work that takes long is shown, so a stuck sync is not mistaken for silence", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, busy, line } = setup();
  busy.value = true;
  source.value = { text: "Syncing...", tone: "mute" };
  t.mock.timers.tick(SLOW_MS - 1);
  assert.equal(line.value.text, "");
  t.mock.timers.tick(1);
  assert.equal(line.value.text, "Syncing...");
});

test("errors and the newer-on-the-server marker show at once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, line } = setup();
  source.value = { text: "Saved, sign in again", tone: "bad" };
  assert.equal(line.value.text, "Saved, sign in again");
  source.value = { text: "Newer on the server", tone: "accent" };
  assert.equal(line.value.text, "Newer on the server");
});

test("an empty line clears at once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, line } = setup({ text: "Saved and synced", tone: "ok" });
  t.mock.timers.tick(SETTLE_MS);
  source.value = { text: "", tone: "mute" };
  assert.equal(line.value.text, "");
});
