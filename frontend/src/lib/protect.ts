// Protected drafts (docs/sync.md, "Protected drafts"). A protected draft's `content` is an envelope string instead of its text, so every
// store (SQLite, IndexedDB, the server) keeps it as an ordinary draft and the syncer needs no second path.
//
//   hp-protected:1:{"s":"<salt>","n":"<nonce>","c":"<ciphertext>","t":"<title, only when shown in the list>"}
//
// Key = Argon2id(passphrase, salt); the text and the title are sealed with AES-256-GCM, with the draft id as additional data so a blob cannot
// move to another draft. The salt stays the same for the life of the draft; the nonce is new on every write.

export const PREFIX = "hp-protected:1:";

// 32 MiB, 3 passes, 1 lane. `memoryKiB` and `passes` are parameters for the tests.
export const COST = { memoryKiB: 32 * 1024, passes: 3 };

export class WrongPassphrase extends Error {
  constructor() {
    super("Wrong passphrase.");
    this.name = "WrongPassphrase";
  }
}

export interface Sealed {
  content: string;
  title: string;
}

/** An unlocked draft: the key lives only in memory, and only as long as the draft stays open. */
export interface Session {
  key: CryptoKey;
  salt: Uint8Array;
}

interface Envelope {
  s: string;
  n: string;
  c: string;
  t?: string;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
const aad = (id: string) => new TextEncoder().encode(id);

export const isProtected = (content: string) => content.startsWith(PREFIX);

/** The excerpt of a protected draft's list entry. No stored field says "protected", and the list shows no excerpt for such a draft, so this
 * marker is how the list (and the check of a passphrase against another protected draft) tells one from a plain draft. */
export const PROTECTED_MARK = "hp-protected";
export const isProtectedSummary = (d: { excerpt: string }) => d.excerpt === PROTECTED_MARK;

function parse(content: string): Envelope {
  if (!isProtected(content)) throw new Error("not a protected draft");
  const env = JSON.parse(content.slice(PREFIX.length)) as Envelope;
  if (typeof env.s !== "string" || typeof env.n !== "string" || typeof env.c !== "string") throw new Error("malformed protected draft");
  return env;
}

/** The title stored unencrypted for the draft list, or null when it is encrypted or the content is not protected. */
export function clearTitle(content: string): string | null {
  if (!isProtected(content)) return null;
  try {
    const t = parse(content).t;
    return typeof t === "string" ? t : null;
  } catch {
    return null;
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, cost = COST): Promise<CryptoKey> {
  // Loaded when first needed, so the page does not carry the hash code until someone protects or opens a draft.
  const { argon2id } = await import("hash-wasm");
  const raw = await argon2id({
    password: passphrase,
    salt,
    parallelism: 1,
    iterations: cost.passes,
    memorySize: cost.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** A new session for a draft that is being protected: a fresh random salt. */
export async function newSession(passphrase: string, cost = COST): Promise<Session> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt, key: await deriveKey(passphrase, salt, cost) };
}

/** The envelope for `text`. `showTitle` stores the title in the clear, for the draft list. */
export async function seal(session: Session, id: string, text: Sealed, showTitle: boolean): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, content: text.content, title: text.title }));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(id) }, session.key, plain);
  const env: Envelope = { s: b64(session.salt), n: b64(nonce), c: b64(new Uint8Array(cipher)) };
  if (showTitle) env.t = text.title;
  return PREFIX + JSON.stringify(env);
}

/** Unlocks a protected draft. Throws WrongPassphrase when the passphrase does not open it. */
export async function unlock(content: string, id: string, passphrase: string, cost = COST): Promise<{ session: Session; text: Sealed }> {
  const env = parse(content);
  const salt = unb64(env.s);
  const key = await deriveKey(passphrase, salt, cost);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.n), additionalData: aad(id) }, key, unb64(env.c));
  } catch {
    throw new WrongPassphrase();
  }
  const body = JSON.parse(new TextDecoder().decode(plain)) as { content?: unknown; title?: unknown };
  if (typeof body.content !== "string" || typeof body.title !== "string") throw new Error("malformed protected draft");
  return { session: { key, salt }, text: { content: body.content, title: body.title } };
}

/** Opens a newer version of a draft that is already unlocked, with the same key (the salt must be the same). null: another salt, so it
 * needs the passphrase again. */
export async function openWith(session: Session, content: string, id: string): Promise<Sealed | null> {
  const env = parse(content);
  const salt = unb64(env.s);
  if (salt.length !== session.salt.length || salt.some((b, i) => b !== session.salt[i])) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.n), additionalData: aad(id) }, session.key, unb64(env.c));
    const body = JSON.parse(new TextDecoder().decode(plain)) as { content?: unknown; title?: unknown };
    return typeof body.content === "string" && typeof body.title === "string" ? { content: body.content, title: body.title } : null;
  } catch {
    return null;
  }
}
