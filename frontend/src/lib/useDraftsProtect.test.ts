import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";
import { isProtected, isProtectedSummary, WrongPassphrase } from "./protect.ts";
import { summarize } from "./summarize.ts";
import { useDrafts } from "./useDrafts.ts";

// detach() removes the page's listeners; there is no page here.
const noEvents = { addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: noEvents, document: noEvents });

const A = "a".repeat(32);
const B = "b".repeat(32);
const PW = "correct horse battery";
const setups: { detach(): void }[] = [];

// The idle lock timer would keep the process alive, so every test ends by detaching.
const check = (name: string, fn: () => Promise<void>) =>
  test(name, async () => {
    try {
      await fn();
    } finally {
      for (const d of setups.splice(0)) d.detach();
    }
  });

// Drafts over an in-memory store and a fake editor: what a protected draft writes, shows and refuses.
function setup(initial: Record<string, { content: string; filePath?: string }>) {
  const store = new Map<string, Record<string, unknown> & { content: string; title?: string }>(
    Object.entries(initial).map(([id, d]) => [id, { id, format: "markdown", createdAt: 1, updatedAt: 1, filePath: "", ...d }]),
  );
  const writes: string[] = [];
  const fileWrites: unknown[] = [];
  const loads: string[] = [];
  const toasts: string[] = [];
  const editor = ref({
    text: "",
    getText() {
      return this.text;
    },
    replaceText() {},
    load(t: string) {
      this.text = t;
      loads.push(t);
    },
    composing: () => false,
    undo() {},
    focus() {},
  });
  const api = {
    getDraft: async (id: string) => ({ ...store.get(id) }),
    saveDraft: async (d: { id: string; content: string; format: string; createdAt?: number }) => {
      writes.push(d.content);
      const row = { ...store.get(d.id), ...d, updatedAt: Date.now(), filePath: store.get(d.id)?.filePath ?? "", ...summarize(d.content) };
      store.set(d.id, row);
      return row;
    },
    searchDrafts: async (q: string) => ({
      drafts: [...store.values()].filter((d) => d.content.includes(q)).map((d) => ({ id: d.id, ...summarize(d.content) })),
      total: 0,
    }),
    listDrafts: async () => ({ drafts: [], total: 0 }),
    saveDraftToFile: async (...args: unknown[]) => {
      fileWrites.push(args);
      return { draft: {}, cancelled: false, conflict: false };
    },
    linkedFileStatus: async () => ({ state: "none" }),
  };
  const drafts = useDrafts(editor as never, ref(false), {}, api as never);
  setups.push(drafts);
  const open = (id: string) => drafts.init({ open: store.get(id) as never, total: store.size });
  const type = (text: string) => {
    editor.value.text = text;
    drafts.edited();
  };
  const flushAll = () => drafts.flush();
  return { drafts, editor, store, writes, fileWrites, loads, toasts, open, type, flushAll };
}

check("protecting a draft writes only an envelope, and the text stays on screen", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  const shown = t.open(A);
  t.editor.value.text = shown;
  await t.drafts.protect(PW);
  const stored = t.store.get(A)?.content ?? "";
  assert.ok(isProtected(stored));
  assert.ok(!stored.includes("secret"));
  assert.equal(t.editor.value.text, "# Plan\nsecret words");
  assert.equal(t.drafts.protectedDraft.value, true);
  assert.equal(t.drafts.locked.value, false);
  assert.ok(isProtectedSummary(t.store.get(A) as never));
});

check("typing in an unlocked protected draft keeps writing envelopes", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW);
  t.writes.length = 0;
  t.type("# Plan\nmore secret words");
  await t.flushAll();
  assert.equal(t.writes.length, 1);
  assert.ok(isProtected(t.writes[0]) && !t.writes[0].includes("secret"));
});

check("a protected draft opens locked with an empty editor, and unlocks with the passphrase", async () => {
  const w = setup({ [A]: { content: "# Plan\nsecret words" } });
  w.editor.value.text = w.open(A);
  await w.drafts.protect(PW);
  const envelope = w.store.get(A)?.content as string;

  const t = setup({ [A]: { content: envelope } });
  assert.equal(t.open(A), "");
  assert.equal(t.drafts.locked.value, true);
  await assert.rejects(t.drafts.unlock("wrong passphrase"), WrongPassphrase);
  assert.equal(t.drafts.locked.value, true);
  await t.drafts.unlock(PW);
  assert.equal(t.drafts.locked.value, false);
  assert.equal(t.editor.value.text, "# Plan\nsecret words");
});

check("locking saves first, then empties the editor", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW);
  t.type("# Plan\nedited secret");
  await t.drafts.lock();
  assert.equal(t.drafts.locked.value, true);
  assert.equal(t.editor.value.text, "");
  const env = t.store.get(A)?.content as string;
  await t.drafts.unlock(PW);
  assert.equal(t.editor.value.text, "# Plan\nedited secret");
  assert.ok(isProtected(env));
});

check("a second draft must use the passphrase of the first", async () => {
  const t = setup({ [A]: { content: "# One\none" }, [B]: { content: "# Two\ntwo" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW);
  await t.drafts.open(B);
  assert.deepEqual(await t.drafts.protectCheck(), { mode: "verify" });
  await assert.rejects(t.drafts.protect("another passphrase"), WrongPassphrase);
  assert.equal(t.drafts.protectedDraft.value, false);
  assert.equal(t.store.get(B)?.content, "# Two\ntwo");
  await t.drafts.protect(PW);
  assert.ok(isProtected(t.store.get(B)?.content as string));
});

check("the first protected draft takes a new passphrase", async () => {
  const t = setup({ [A]: { content: "# One\none" } });
  t.editor.value.text = t.open(A);
  assert.deepEqual(await t.drafts.protectCheck(), { mode: "create" });
});

check("the title is stored in the clear only when shown, and encrypted again when hidden", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW);
  assert.equal(t.store.get(A)?.title, "Locked draft");
  await t.drafts.setTitleShown(true);
  assert.equal(t.store.get(A)?.title, "Plan");
  assert.ok(!String(t.store.get(A)?.content).includes("secret"));
  await t.drafts.setTitleShown(false);
  assert.equal(t.store.get(A)?.title, "Locked draft");
});

check("removing protection stores the text as plain text", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW);
  await t.drafts.unprotect();
  assert.equal(t.store.get(A)?.content, "# Plan\nsecret words");
  assert.equal(t.drafts.protectedDraft.value, false);
});

check("a draft linked to a file cannot be protected, and a protected draft never writes a file", async () => {
  const linked = setup({ [A]: { content: "text", filePath: "/home/me/a.md" } });
  linked.editor.value.text = linked.open(A);
  assert.ok("error" in (await linked.drafts.protectCheck()));
  await assert.rejects(linked.drafts.protect(PW));

  const t = setup({ [B]: { content: "text" } });
  t.editor.value.text = t.open(B);
  await t.drafts.protect(PW);
  await t.drafts.saveFile(true);
  await t.drafts.saveFile(false);
  assert.equal(t.fileWrites.length, 0);
});
