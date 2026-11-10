// Protected drafts (docs/sync.md, "Protected drafts"). A protected draft's `content` is an envelope string instead of its text, so every
// store (SQLite, IndexedDB, the server) keeps it as an ordinary draft and the syncer needs no second path.
//
//   hp-protected:1:{"s":"<salt>","n":"<nonce>","c":"<ciphertext>","t":"<title, only when shown in the list>"}
//
// Key = Argon2id(passphrase, salt); the text is sealed with AES-256-GCM, with the draft id as additional data so a blob cannot
// move to another draft. The salt stays the same for the life of the draft; the nonce is new on every write.

export const PREFIX = "hp-protected:1:";

// 128 MiB, 3 passes, 1 lane. `memoryKiB` and `passes` are parameters for the tests.
export const COST = { memoryKiB: 128 * 1024, passes: 3 };

/** The passphrase is wrong, or the stored draft was changed (its text, id or title): the seal cannot tell the two apart. */
export class WrongPassphrase extends Error {
  constructor() {
    super("Wrong passphrase.");
    this.name = "WrongPassphrase";
  }
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

const encodeBase64 = (bytes: Uint8Array): string => bytes.toBase64();
const unb64 = (text: string) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
// What the seal covers besides the text: the draft id, and the title that sits beside the ciphertext, so the server can neither move a copy to
// another draft nor change or swap a title unnoticed. A draft without a title is covered by its id alone.
const aad = (id: string, title: string) => new TextEncoder().encode(title ? `${id}\n${title}` : id);

export const isProtected = (content: string) => content.startsWith(PREFIX);

function parse(content: string): Envelope {
  if (!isProtected(content)) throw new Error("not a protected draft");
  const env = JSON.parse(content.slice(PREFIX.length)) as Envelope;
  if (typeof env.s !== "string" || typeof env.n !== "string" || typeof env.c !== "string") throw new Error("malformed protected draft");
  return env;
}

/** The title the user gave a protected draft, stored unencrypted for the draft list; "" when none was given, which includes every draft
 * protected before titles existed. */
export function clearTitle(content: string): string {
  if (!isProtected(content)) return "";
  try {
    const t = parse(content).t;
    return typeof t === "string" ? t : "";
  } catch {
    return "";
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

/** The envelope for `content`, with `title` beside it in the clear unless it is empty. */
export async function seal(session: Session, id: string, content: string, title: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, content }));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(id, title) }, session.key, plain);
  const env: Envelope = { s: encodeBase64(session.salt), n: encodeBase64(nonce), c: encodeBase64(new Uint8Array(cipher)) };
  if (title) env.t = title;
  return PREFIX + JSON.stringify(env);
}

/** Unlocks a protected draft. Throws WrongPassphrase when the passphrase does not open it. */
export async function unlock(content: string, id: string, passphrase: string, cost = COST): Promise<{ session: Session; content: string }> {
  const env = parse(content);
  const salt = unb64(env.s);
  const key = await deriveKey(passphrase, salt, cost);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.n), additionalData: aad(id, env.t ?? "") }, key, unb64(env.c));
  } catch {
    throw new WrongPassphrase();
  }
  const body = JSON.parse(new TextDecoder().decode(plain)) as { content?: unknown };
  if (typeof body.content !== "string") throw new Error("malformed protected draft");
  return { session: { key, salt }, content: body.content };
}

/** A new draft id: 32 lowercase hex digits, as the stores make them. A protected copy needs its id before it is sealed. */
export function newDraftId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Opens a newer version of a draft that is already unlocked, with the same key (the salt must be the same). null: another salt, so it
 * needs the passphrase again. */
export async function openWith(session: Session, content: string, id: string): Promise<string | null> {
  const env = parse(content);
  const salt = unb64(env.s);
  if (salt.length !== session.salt.length || salt.some((b, i) => b !== session.salt[i])) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(env.n), additionalData: aad(id, env.t ?? "") },
      session.key,
      unb64(env.c),
    );
    const body = JSON.parse(new TextDecoder().decode(plain)) as { content?: unknown };
    return typeof body.content === "string" ? body.content : null;
  } catch {
    return null;
  }
}
