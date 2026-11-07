// Runs the cases in internal/core/testdata/ (summarize.json, filename.json) through the compiled Go module (`npm run wasm`; testSetup.js loads it). The Go side
// runs the same file against the Go code (TestSummarizeFixtures in internal/core), so the desktop and web builds cannot drift apart.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { suggestName, summarize } from "./core.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../internal/core/testdata/summarize.json", import.meta.url), "utf8"));

for (const f of fixtures) {
  test(f.name, async () => {
    assert.deepEqual(await summarize(f.content), {
      title: f.title,
      excerpt: f.excerpt,
      tasks: f.tasks,
      tasksTotal: f.tasksTotal,
      tasksDone: f.tasksDone,
    });
  });
}

const names = JSON.parse(readFileSync(new URL("../../../internal/core/testdata/filename.json", import.meta.url), "utf8"));
for (const f of names) {
  test(`file name: ${f.name}`, async () => assert.equal(await suggestName(f.title, f.format), f.want));
}

test("a large text and repeated calls keep working (memory grows and is reused)", async () => {
  const big = `# Big\n${"- [x] a task line\n".repeat(20000)}`;
  for (let i = 0; i < 20; i++) assert.equal((await summarize(big)).tasksTotal, 20000);
  assert.equal((await summarize("after")).title, "after");
});
