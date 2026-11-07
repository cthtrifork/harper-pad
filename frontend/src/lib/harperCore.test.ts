import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { LocalLinter } from "harper.js";
import { slimBinaryInlined } from "harper.js/slimBinaryInlined";
import { harperMethods } from "./harperCore.ts";

// The real Harper, not a stand-in: these fail when a harper.js update changes what the worker relies on (the method names, the shape
// of a finding, what a hash is), so a Renovate bump cannot merge unseen. The inlined binary is the one that loads in Node.
const TEXT = "This is a sentance with teh typo.";
let harper: ReturnType<typeof harperMethods>;

before(async () => {
  harper = harperMethods(new LocalLinter({ binary: slimBinaryInlined }));
  await harper.setup();
});
after(() => harper.dispose());

const problems = (found) => found.map((f) => f.problem).sort();

test("a misspelling is found, as a plain finding that can cross a message channel", async () => {
  const found = await harper.lintPlain(TEXT);
  assert.deepEqual(problems(found), ["sentance", "teh"]);
  const f = found.find((x) => x.problem === "teh");
  assert.equal(TEXT.slice(f.from, f.to), "teh");
  assert.equal(typeof f.kind, "string");
  assert.equal(typeof f.message, "string");
  assert.ok(f.fixes.length > 0);
  assert.ok(f.fixes.some((fix) => fix.kind === "replace" && fix.text === "the"));
  assert.equal(typeof f.hash, "bigint"); // 64-bit: it does not fit a number
  assert.deepEqual(structuredClone(found), found); // nothing wasm-backed is left in it
});

test("clean text has no findings", async () => {
  assert.deepEqual(await harper.lintPlain("This is a clean sentence."), []);
});

test("a word added to the dictionary is no longer a finding, and is exported", async () => {
  await harper.importWords(["sentance"]);
  assert.ok((await harper.exportWords()).includes("sentance"));
  assert.deepEqual(problems(await harper.lintPlain(TEXT)), ["teh"]);
});

// Harper can report a second finding on the same word once the first is ignored (it has its own hash), so these check that the
// ignored finding's hash is gone, not that the text has no findings left.
const hashes = async () => (await harper.lintPlain(TEXT)).map((f) => f.hash);

test("an ignored finding is hidden, exported by its hash, and comes back when the list is cleared", async () => {
  const [teh] = (await harper.lintPlain(TEXT)).filter((f) => f.problem === "teh");
  await harper.ignoreLintHash(teh.hash);
  assert.match(await harper.exportIgnoredLints(), new RegExp(`"context_hashes"\\s*:\\s*\\[[^\\]]*${teh.hash}`));
  assert.ok(!(await hashes()).includes(teh.hash));
  await harper.clearIgnoredLints();
  assert.ok((await hashes()).includes(teh.hash));
});

test("an exported ignore list can be loaded again", async () => {
  const [teh] = (await harper.lintPlain(TEXT)).filter((f) => f.problem === "teh");
  await harper.ignoreLintHash(teh.hash);
  const saved = await harper.exportIgnoredLints();
  await harper.clearIgnoredLints();
  assert.ok((await hashes()).includes(teh.hash));
  await harper.importIgnoredLints(saved);
  assert.ok(!(await hashes()).includes(teh.hash));
});
