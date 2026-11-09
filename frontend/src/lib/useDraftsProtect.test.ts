import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";
import { isProtected, isProtectedSummary, unlock as unlockEnvelope, WrongPassphrase } from "./protect.ts";
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
  const fail = { saves: false, gate: null as Promise<void> | null }; // `saves` makes every save fail; `gate` holds the list back
  const unlinked: string[] = [];
  const api = {
    unlinkDraftFile: async (id: string) => {
      unlinked.push(id);
      return { id };
    },
    getDraft: async (id: string) => ({ ...store.get(id) }),
    saveDraft: async (d: { id: string; content: string; format: string; createdAt?: number }) => {
      if (fail.saves) throw new Error("disk full");
      writes.push(d.content);
      const row = { ...store.get(d.id), ...d, updatedAt: Date.now(), filePath: store.get(d.id)?.filePath ?? "", ...summarize(d.content) };
      store.set(d.id, row);
      return row;
    },
    listDrafts: async (limit: number, offset: number) => {
      await fail.gate;
      const all = [...store.values()].map((d) => ({ id: d.id, ...summarize(d.content) }));
      return { drafts: all.slice(offset, offset + limit), total: all.length };
    },
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
  return { drafts, editor, store, writes, fileWrites, loads, toasts, open, type, flushAll, fail, unlinked };
}

check("protecting a draft writes only an envelope, and the text stays on screen", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  const shown = t.open(A);
  t.editor.value.text = shown;
  await t.drafts.protect(PW, "A title");
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
  await t.drafts.protect(PW, "A title");
  t.writes.length = 0;
  t.type("# Plan\nmore secret words");
  await t.flushAll();
  assert.equal(t.writes.length, 1);
  assert.ok(isProtected(t.writes[0]) && !t.writes[0].includes("secret"));
});

check("a protected draft opens locked with an empty editor, and unlocks with the passphrase", async () => {
  const w = setup({ [A]: { content: "# Plan\nsecret words" } });
  w.editor.value.text = w.open(A);
  await w.drafts.protect(PW, "A title");
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
  await t.drafts.protect(PW, "A title");
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
  await t.drafts.protect(PW, "A title");
  await t.drafts.open(B);
  assert.deepEqual(await t.drafts.protectCheck(), { mode: "verify" });
  await assert.rejects(t.drafts.protect("another passphrase", "A title"), WrongPassphrase);
  assert.equal(t.drafts.protectedDraft.value, false);
  assert.equal(t.store.get(B)?.content, "# Two\ntwo");
  await t.drafts.protect(PW, "A title");
  assert.ok(isProtected(t.store.get(B)?.content as string));
});

check("the first protected draft takes a new passphrase", async () => {
  const t = setup({ [A]: { content: "# One\none" } });
  t.editor.value.text = t.open(A);
  assert.deepEqual(await t.drafts.protectCheck(), { mode: "create" });
});

check("the list title is the one chosen, kept when the text changes, and can be changed", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  assert.deepEqual(await t.drafts.protectCheck(), { mode: "create" });
  await t.drafts.protect(PW, "Groceries");
  assert.equal(t.store.get(A)?.title, "Groceries");
  assert.ok(!String(t.store.get(A)?.content).includes("secret"));
  t.type("# Something else\nmore");
  await t.flushAll();
  assert.equal(t.store.get(A)?.title, "Groceries");
  await t.drafts.setListTitle("Errands");
  assert.equal(t.store.get(A)?.title, "Errands");
  await t.drafts.setListTitle("  ");
  assert.equal(t.store.get(A)?.title, "Locked draft");
});

check("removing protection stores the text as plain text", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW, "A title");
  await t.drafts.unprotect();
  assert.equal(t.store.get(A)?.content, "# Plan\nsecret words");
  assert.equal(t.drafts.protectedDraft.value, false);
});

check("a draft linked to a file cannot be protected, and a protected draft never writes a file", async () => {
  const linked = setup({ [A]: { content: "text", filePath: "/home/me/a.md" } });
  linked.editor.value.text = linked.open(A);
  assert.ok("error" in (await linked.drafts.protectCheck()));
  await assert.rejects(linked.drafts.protect(PW, "A title"));

  const t = setup({ [B]: { content: "text" } });
  t.editor.value.text = t.open(B);
  await t.drafts.protect(PW, "A title");
  await t.drafts.saveFile(true);
  await t.drafts.saveFile(false);
  assert.equal(t.fileWrites.length, 0);
});

check("a Conflicted copy of a protected draft is protected, under its own id, and opens with the same passphrase", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW, "Plan");
  const theirs = await t.drafts.dialog.plain(String(t.store.get(A)?.content));
  assert.equal(theirs, "# Plan\nsecret words"); // a version from the server opens with the key held
  const id = await t.drafts.dialog.saveCopy("# Plan\nthe server text", "server");
  const copy = String(t.store.get(id)?.content);
  assert.notEqual(id, A);
  assert.ok(isProtected(copy) && !copy.includes("server text"));
  assert.equal(t.store.get(id)?.title, "Plan");
  assert.equal((await unlockEnvelope(copy, id, PW)).content, "# Plan\nthe server text");
});

check("a locked draft has no dialog, and a version it cannot open is not compared", async () => {
  const w = setup({ [A]: { content: "# Plan\nsecret words" } });
  w.editor.value.text = w.open(A);
  await w.drafts.protect(PW, "Plan");
  const envelope = String(w.store.get(A)?.content);

  const t = setup({ [A]: { content: envelope } });
  t.open(A);
  assert.equal(t.drafts.dialog.locked(), true);
  assert.equal(await t.drafts.dialog.plain(envelope), null);
  await t.drafts.unlock(PW);
  assert.equal(t.drafts.dialog.locked(), false);
  assert.equal(await t.drafts.dialog.plain("plain server text"), "plain server text");
});

check("a draft is not locked when its last save failed: the text stays on screen", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  await t.drafts.protect(PW, "Plan");
  t.type("# Plan\nunsaved edit");
  t.fail.saves = true;
  await t.drafts.lock();
  assert.equal(t.drafts.locked.value, false);
  assert.equal(t.editor.value.text, "# Plan\nunsaved edit");
  assert.match(String(t.drafts.toast.value?.message), /Not locked/);
  t.fail.saves = false;
  await t.flushAll();
  await t.drafts.lock();
  assert.equal(t.drafts.locked.value, true);
});

check("protection is not reported, and nothing changes, when the encrypted write fails", async () => {
  const t = setup({ [A]: { content: "# Plan\nsecret words" } });
  t.editor.value.text = t.open(A);
  t.fail.saves = true;
  await assert.rejects(t.drafts.protect(PW, "Plan"), /disk full/);
  assert.equal(t.drafts.protectedDraft.value, false);
  assert.equal(t.store.get(A)?.content, "# Plan\nsecret words");
  assert.equal(t.drafts.state.value, "saved");

  t.fail.saves = false;
  await t.drafts.protect(PW, "Plan");
  t.fail.saves = true;
  await assert.rejects(t.drafts.unprotect(), /disk full/);
  assert.equal(t.drafts.protectedDraft.value, true, "still protected, and still unlocked");
  assert.equal(t.drafts.locked.value, false);
  t.fail.saves = false;
  t.type("# Plan\nmore");
  await t.flushAll();
  assert.ok(isProtected(String(t.store.get(A)?.content)));
});

check("a protect that finishes after the draft was left changes nothing", async () => {
  const t = setup({ [A]: { content: "# One\none" }, [B]: { content: "# Two\ntwo" } });
  t.editor.value.text = t.open(A);
  let release = () => {};
  t.fail.gate = new Promise<void>((r) => (release = r));
  const pending = t.drafts.protect(PW, "One");
  await t.drafts.open(B);
  release();
  await assert.rejects(pending, /changed while it was being protected/);
  assert.equal(t.store.get(A)?.content, "# One\none");
  assert.equal(t.store.get(B)?.content, "# Two\ntwo");
  assert.equal(t.drafts.protectedDraft.value, false);
});

check("an unlock that finishes after the app was backgrounded installs no key", async () => {
  const w = setup({ [A]: { content: "# Plan\nsecret words" } });
  w.editor.value.text = w.open(A);
  await w.drafts.protect(PW, "Plan");
  const t = setup({ [A]: { content: String(w.store.get(A)?.content) } });
  t.open(A);
  const pending = t.drafts.unlock(PW);
  await t.drafts.lock(); // what the app going to the background does
  await assert.rejects(pending, /changed while it was being unlocked/);
  assert.equal(t.drafts.locked.value, true);
  assert.equal(t.editor.value.text, "");
});

check("a copy of a protected draft is refused while it is locked, never saved as plain text", async () => {
  const w = setup({ [A]: { content: "# Plan\nsecret words" } });
  w.editor.value.text = w.open(A);
  await w.drafts.protect(PW, "Plan");
  const t = setup({ [A]: { content: String(w.store.get(A)?.content) } });
  t.open(A);
  await assert.rejects(t.drafts.dialog.saveCopy("# Plan\nthe server text", "server"), /locked/);
  assert.equal(t.store.size, 1);
  assert.equal(t.writes.length, 0);
});

check("a protected draft lets go of its file, never writes one, and its unlink Undo is withdrawn", async () => {
  const w = setup({ [A]: { content: "# Plan\nsecret words" } });
  w.editor.value.text = w.open(A);
  await w.drafts.protect(PW, "Plan");
  const envelope = String(w.store.get(A)?.content);

  const t = setup({ [A]: { content: envelope, filePath: "/home/me/plan.md" } });
  t.open(A);
  assert.equal(t.drafts.current.value.filePath, "");
  assert.deepEqual(t.unlinked, [A]);
  await t.drafts.unlock(PW);
  await assert.rejects(t.drafts.dialog.writeFile(), /cannot be written to a file/);
  assert.equal(t.fileWrites.length, 0);

  const u = setup({ [B]: { content: "# Two\ntwo" } });
  u.editor.value.text = u.open(B);
  u.drafts.unlinkedToast.value = { id: B, name: "two.md", tick: 1 };
  await u.drafts.protect(PW, "Two");
  assert.equal(u.drafts.unlinkedToast.value, null);
});
