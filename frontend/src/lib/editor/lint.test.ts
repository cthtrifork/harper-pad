import assert from "node:assert/strict";
import test from "node:test";
import type { HarperLinter } from "../harper.ts";
import { personalActions } from "./lint.ts";

test("personal lint actions recheck privacy before mutating Harper or persisting", async () => {
  let isolated = false;
  const calls: unknown[] = [];
  const harper = {
    importWords: async (words: string[]) => calls.push(["words", words]),
    ignoreLintHash: async (hash: bigint) => calls.push(["ignore", hash]),
  } as unknown as HarperLinter;
  const actions = personalActions(
    harper,
    { kind: "Spelling", problem: "secret", hash: 7n } as never,
    async (note) => calls.push(["persist", note]),
    () => isolated,
  );
  const view = { dispatch() {} } as never;

  isolated = true;
  for (const action of actions) await action.apply?.(view, 0, 6);
  assert.deepEqual(calls, []);

  isolated = false;
  for (const action of actions) await action.apply?.(view, 0, 6);
  assert.deepEqual(calls, [
    ["words", ["secret"]],
    ["persist", undefined],
    ["ignore", 7n],
    ["persist", { ignoredHash: 7n, label: "secret (Spelling)" }],
  ]);
});
