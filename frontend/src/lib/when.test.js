import assert from "node:assert/strict";
import test from "node:test";
import { whenLabel, whenStamp } from "./when.js";

// The exact wording depends on the ICU data of the Node build, so these check what is shown, not the format.
const now = new Date(2026, 10, 5, 12, 0); // Thu 5 Nov 2026, local time
const at = (y, m, d) => new Date(y, m, d, 9, 12).getTime();

test("today shows the time", () => {
  assert.match(whenLabel(at(2026, 10, 5), now), /^Today, 09:12/);
});

test("yesterday and the weekday for the last week", () => {
  assert.equal(whenLabel(at(2026, 10, 4), now), "Yesterday");
  assert.equal(whenLabel(at(2026, 10, 2), now), "Mon");
});

test("older dates show the year only when it is not this year", () => {
  assert.doesNotMatch(whenLabel(at(2026, 9, 29), now), /2026/);
  assert.match(whenLabel(at(2025, 8, 5), now), /2025/);
});

test("a dialog timestamp is the time today and a short date with the time otherwise", () => {
  const today = new Date(2026, 10, 5, 22, 36).getTime();
  assert.match(whenStamp(today, now), /^22:36$/);
  assert.match(whenStamp(new Date(2026, 10, 4, 9, 5).getTime(), now), /^4 Nov, 09:05$/);
  assert.doesNotMatch(whenStamp(new Date(2026, 9, 29, 9, 5).getTime(), now), /2026/);
  assert.match(whenStamp(new Date(2025, 8, 5, 9, 5).getTime(), now), /^5 Sep(t)? 2025, 09:05$/);
});
