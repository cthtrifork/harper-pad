// Runs the cases in testdata/summarize.json through `summarize`.
// Run with `npm test` (Node's built-in test runner, no dependencies).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { summarize } from "./summarize.ts";

const fixtures = JSON.parse(readFileSync(new URL("./testdata/summarize.json", import.meta.url), "utf8"));

test("there are fixtures", () => {
  assert.ok(fixtures.length > 0);
});

for (const f of fixtures) {
  test(f.name, () => {
    assert.deepEqual(summarize(f.content), {
      title: f.title,
      excerpt: f.excerpt,
      tasks: f.tasks,
      tasksTotal: f.tasksTotal,
      tasksDone: f.tasksDone,
    });
  });
}
