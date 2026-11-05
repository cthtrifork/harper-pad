import assert from "node:assert/strict";
import test from "node:test";
import { connect, lintText } from "./harper.js";

// A stand-in for the worker: answers each message from `handlers` after a tick, like harperWorker.js does.
function fakeWorker(handlers) {
  const w = {
    sent: [],
    terminated: false,
    postMessage(msg) {
      w.sent.push(msg);
      queueMicrotask(async () => {
        try {
          w.onmessage({ data: { id: msg.id, result: await handlers[msg.method](...msg.args) } });
        } catch (err) {
          w.onmessage({ data: { id: msg.id, error: String(err.message ?? err) } });
        }
      });
    },
    terminate() {
      w.terminated = true;
    },
  };
  return w;
}

test("setup runs first, then each method is one message and returns the answer", async () => {
  const w = fakeWorker({ setup: () => {}, exportWords: () => ["alpha", "beta"], lintPlain: (t) => [{ problem: t }] });
  const linter = await connect(w);
  assert.equal(w.sent[0].method, "setup");
  assert.deepEqual(await linter.exportWords(), ["alpha", "beta"]);
  assert.deepEqual(await lintText(linter, "teh"), [{ problem: "teh" }]);
  assert.deepEqual(w.sent.at(-1).args, ["teh"]);
});

test("answers go to the call they belong to, even out of order", async () => {
  const w = fakeWorker({
    setup: () => {},
    exportWords: () => ["w"],
    exportIgnoredLints: () => new Promise((r) => setTimeout(() => r("{}"), 10)),
  });
  const linter = await connect(w);
  const [slow, fast] = await Promise.all([linter.exportIgnoredLints(), linter.exportWords()]);
  assert.equal(slow, "{}");
  assert.deepEqual(fast, ["w"]);
});

test("a hash stays a bigint (it is 64-bit and does not fit a number)", async () => {
  const w = fakeWorker({ setup: () => {}, ignoreLintHash: () => {} });
  const linter = await connect(w);
  await linter.ignoreLintHash(18446744073709551615n);
  assert.equal(w.sent.at(-1).args[0], 18446744073709551615n);
});

test("an error in the worker rejects that call only", async () => {
  const w = fakeWorker({
    setup: () => {},
    importWords: () => {
      throw new Error("bad word");
    },
    exportWords: () => [],
  });
  const linter = await connect(w);
  await assert.rejects(linter.importWords(["x"]), /bad word/);
  assert.deepEqual(await linter.exportWords(), []);
});

test("a failed setup rejects connect", async () => {
  const w = fakeWorker({
    setup: () => {
      throw new Error("no wasm");
    },
  });
  await assert.rejects(connect(w), /no wasm/);
});

test("dispose ends the worker and rejects calls still waiting", async () => {
  const w = fakeWorker({ setup: () => {}, exportWords: () => new Promise(() => {}) });
  const linter = await connect(w);
  const waiting = linter.exportWords();
  await linter.dispose();
  assert.equal(w.terminated, true);
  await assert.rejects(waiting, /disposed/);
});

test("a crash of the worker rejects calls still waiting", async () => {
  const w = fakeWorker({ setup: () => {}, exportWords: () => new Promise(() => {}) });
  const linter = await connect(w);
  const waiting = linter.exportWords();
  w.onerror({ message: "boom" });
  await assert.rejects(waiting, /boom/);
});
