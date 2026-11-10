import assert from "node:assert/strict";
import test from "node:test";
import { computed, ref } from "vue";
import { isProtected, newSession, seal, unlock as unlockEnvelope, WrongPassphrase } from "./protectedDrafts.ts";
import { summarize } from "./summarize.ts";
import { useConflict } from "./useConflict.ts";
import { useDrafts } from "./useDrafts.ts";

// detach() removes the page's listeners; there is no page here.
Object.assign(globalThis, { window: new EventTarget(), document: new EventTarget() });

const A = "a".repeat(32);
const B = "b".repeat(32);
const PW = "correct horse battery";
const setups: { detach(): void }[] = [];

// Clear autosave timers and page listeners after each test.
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
  const fail = { saves: false };
  const api = {
    getDraft: async (id: string) => ({ ...store.get(id) }),
    saveDraft: async (d: { id: string; content: string; format: string; createdAt?: number }) => {
      if (fail.saves) throw new Error("disk full");
      writes.push(d.content);
      const row = { ...store.get(d.id), ...d, updatedAt: Date.now(), filePath: store.get(d.id)?.filePath ?? "", ...summarize(d.content) };
      store.set(d.id, row);
      return row;
    },
    listDrafts: async (limit: number, offset: number) => {
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
  return { drafts, editor, store, writes, fileWrites, loads, toasts, open, type, flushAll, fail };
}

// A new protected draft with some text typed and saved; returns its id.
async function secure(t: ReturnType<typeof setup>, text: string, title = "Plan") {
  await t.drafts.createSecure(PW, title);
  t.type(text);
  await t.flushAll();
  return t.drafts.current.value.id;
}

check("a new secure draft stores nothing until typed, then only an envelope, and the text stays on screen", async () => {
  const t = setup({});
  await t.drafts.createSecure(PW, "A title");
  assert.equal(t.store.size, 0);
  assert.equal(t.drafts.protectedDraft.value, true);
  assert.equal(t.drafts.locked.value, false);
  const id = await secure(t, "# Plan\nsecret words", "A title");
  const stored = t.store.get(id)?.content ?? "";
  assert.ok(isProtected(stored));
  assert.ok(!stored.includes("secret"));
  assert.equal(t.editor.value.text, "# Plan\nsecret words");
  assert.equal(t.store.get(id)?.protected, true);
  assert.equal(t.store.get(id)?.title, "A title");

  t.writes.length = 0;
  t.type("# Plan\nmore secret words");
  await t.flushAll();
  assert.equal(t.writes.length, 1);
  assert.ok(isProtected(t.writes[0]) && !t.writes[0].includes("secret"));
  assert.equal(t.store.get(id)?.title, "A title", "the title is kept when the text changes");
});

check("a protected draft opens locked with an empty editor, and unlocks with the passphrase", async () => {
  const w = setup({});
  const id = await secure(w, "# Plan\nsecret words");
  const envelope = w.store.get(id)?.content as string;

  const t = setup({ [id]: { content: envelope } });
  const shown = t.open(id);
  assert.equal(shown, "");
  assert.equal(t.drafts.locked.value, true);
  await assert.rejects(t.drafts.unlock("wrong passphrase"), WrongPassphrase);
  assert.equal(t.drafts.locked.value, true);
  await t.drafts.unlock(PW);
  assert.equal(t.editor.value.text, "# Plan\nsecret words");
});

check("locking saves first, then empties the editor, and unlocking brings the text back", async () => {
  const t = setup({});
  const id = await secure(t, "# Plan\nsecret words");
  t.type("# Plan\nedited secret");
  await t.drafts.lock();
  assert.equal(t.drafts.locked.value, true);
  assert.equal(t.editor.value.text, "");
  assert.ok(isProtected(t.store.get(id)?.content as string));
  await t.drafts.unlock(PW);
  assert.equal(t.editor.value.text, "# Plan\nedited secret");
});

check("an empty secure draft can lock and unlock without creating a stored draft", async () => {
  const t = setup({});
  await t.drafts.createSecure(PW, "Empty");
  await t.drafts.lock();
  assert.equal(t.drafts.locked.value, true);
  assert.equal(t.store.size, 0);
  await t.drafts.unlock(PW);
  assert.equal(t.drafts.locked.value, false);
  assert.equal(t.editor.value.text, "");
  t.type("first edit");
  await t.flushAll();
  const id = t.drafts.current.value.id;
  assert.equal((await unlockEnvelope(String(t.store.get(id)?.content), id, PW)).content, "first edit");
});

check("backgrounding still saves and locks a secure draft without an idle timer", async () => {
  const t = setup({});
  await secure(t, "saved");
  t.drafts.attach();
  t.type("newest edit");
  window.dispatchEvent(new Event("blur"));
  await t.flushAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(t.drafts.locked.value, true);
  assert.equal(t.editor.value.text, "");
  await t.drafts.unlock(PW);
  assert.equal(t.editor.value.text, "newest edit");
});

check("each secure draft has an independent passphrase", async () => {
  const t = setup({ [B]: { content: "# Two\ntwo" } });
  const first = await secure(t, "# One\none");
  await t.drafts.createSecure("another passphrase", "Two");
  t.type("second secret");
  await t.flushAll();
  const second = t.drafts.current.value.id;
  assert.notEqual(first, second);
  await t.drafts.lock();
  await assert.rejects(t.drafts.unlock(PW), WrongPassphrase);
  await t.drafts.unlock("another passphrase");
  assert.equal(t.editor.value.text, "second secret");
  await t.drafts.open(first);
  assert.equal(t.drafts.locked.value, true);
  await assert.rejects(t.drafts.unlock("another passphrase"), WrongPassphrase);
  await t.drafts.unlock(PW);
  assert.equal(t.editor.value.text, "# One\none");
});

check("a plain draft stays plain, and a protected draft never writes a file", async () => {
  const plain = setup({ [B]: { content: "text" } });
  plain.editor.value.text = plain.open(B);
  assert.equal(plain.drafts.protectedDraft.value, false);

  const t = setup({});
  await secure(t, "text");
  await t.drafts.saveFile(true);
  await t.drafts.saveFile(false);
  assert.equal(t.fileWrites.length, 0);
  await assert.rejects(t.drafts.dialog.writeFile(), /cannot be written to a file/);
});

check("Keep both preserves the server as an encrypted copy under its own id before pushing the local version", async () => {
  const t = setup({});
  const mine = await secure(t, "# Plan\nsecret words");
  const remoteSession = (await unlockEnvelope(String(t.store.get(mine)?.content), mine, PW)).session;
  const remote = await seal(remoteSession, mine, "# Plan\nthe server text", "Plan");
  assert.equal(t.drafts.dialog.current().text, t.store.get(mine)?.content, "conflicts compare envelopes, not plaintext");
  const serverConflict = ref({ id: mine, text: remote, format: "markdown", stamp: "2:2", updatedAt: 2, deleted: false });
  let pushed = "";
  const sync = {
    enrolled: computed(() => true),
    serverConflict,
    checkNow: async () => {},
    inspectServer: async () => serverConflict.value,
    forcePush: async () => {
      assert.equal(t.store.size, 2, "the other version is saved before overwriting the server");
      pushed = String(t.store.get(mine)?.content);
      return true;
    },
    clearConflict: () => {
      serverConflict.value = null;
    },
  };
  const conflict = useConflict({ drafts: t.drafts, sync });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await conflict.choose("keep");
  assert.equal(conflict.note.value, "");
  const id = conflict.result.value?.copies[0]?.id;
  assert.ok(id);
  assert.equal(pushed, t.store.get(mine)?.content);
  const copy = String(t.store.get(id)?.content);
  assert.notEqual(id, mine);
  assert.ok(isProtected(copy) && !copy.includes("server text"));
  assert.equal(t.store.get(id)?.title, "Plan");
  assert.equal((await unlockEnvelope(copy, id, PW)).content, "# Plan\nthe server text");
  await assert.rejects(unlockEnvelope(copy, mine, PW), WrongPassphrase, "a copy remains bound to its own id");
  assert.equal(t.editor.value.text, "# Plan\nsecret words", "keeping the server copy does not replace local text");
});

check("Keep refuses an unreadable protected version instead of overwriting it or making a plaintext copy", async () => {
  const t = setup({});
  const mine = await secure(t, "local");
  const otherKey = await newSession("another passphrase", { memoryKiB: 64, passes: 1 });
  const remote = await seal(otherKey, mine, "remote", "Plan");
  const count = t.writes.length;
  await assert.rejects(t.drafts.dialog.saveCopy(remote, "server"), /Could not open/);
  assert.equal(t.writes.length, count);
  assert.equal(t.store.size, 1);
});

check("a draft is not locked when its last save failed: the text stays on screen", async () => {
  const t = setup({});
  await secure(t, "# Plan\nsecret words");
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

check("making a secure draft that finishes after the draft was left changes nothing", async () => {
  const t = setup({ [A]: { content: "# One\none" }, [B]: { content: "# Two\ntwo" } });
  t.editor.value.text = t.open(A);
  const pending = t.drafts.createSecure(PW, "One");
  await t.drafts.open(B);
  await assert.rejects(pending, /changed while the new one was being made/);
  assert.equal(t.drafts.protectedDraft.value, false);
  assert.equal(t.drafts.current.value.id, B);
});

check("an unlock that finishes after the app was backgrounded installs no key", async () => {
  const w = setup({});
  const id = await secure(w, "# Plan\nsecret words");
  const t = setup({ [id]: { content: String(w.store.get(id)?.content) } });
  t.open(id);
  const pending = t.drafts.unlock(PW);
  await t.drafts.lock(); // what the app going to the background does
  await assert.rejects(pending, /changed while it was being unlocked/);
  assert.equal(t.drafts.locked.value, true);
  assert.equal(t.editor.value.text, "");
});

check("a pending protected reload cannot load plaintext after locking", async () => {
  const t = setup({});
  await secure(t, "# Plan\nsecret words");

  const subtle = crypto.subtle as unknown as { decrypt: (...args: unknown[]) => Promise<ArrayBuffer> };
  const decrypt = subtle.decrypt.bind(crypto.subtle);
  let started!: () => void;
  const entered = new Promise<void>((resolve) => (started = resolve));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  subtle.decrypt = async (...args) => {
    started();
    await gate;
    return decrypt(...args);
  };
  try {
    const pending = t.drafts.reloadCurrent();
    await entered;
    await t.drafts.lock();
    release();
    await pending;
    assert.equal(t.drafts.locked.value, true);
    assert.equal(t.editor.value.text, "");
  } finally {
    subtle.decrypt = decrypt;
    release();
  }
});

check("a copy of a protected draft is refused while it is locked, never saved as plain text", async () => {
  const w = setup({});
  const id = await secure(w, "# Plan\nsecret words");
  const t = setup({ [id]: { content: String(w.store.get(id)?.content) } });
  t.open(id);
  await assert.rejects(t.drafts.dialog.saveCopy("# Plan\nthe server text", "server"), /locked/);
  assert.equal(t.store.size, 1);
  assert.equal(t.writes.length, 0);
});
