export function normalizePassword(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function expectedPassword(account: { id: string; name: string; code?: string }) {
  const code = (account.code || "").trim();
  if (code) return code;
  if (account.id === "admin" || account.name.trim().toLowerCase() === "admin") return "bh888";
  if (account.id === "mia" || account.name.trim().toLowerCase() === "mia") return "bh888";
  return "";
}

export function passwordsMatch(input: string, stored: string) {
  const typed = normalizePassword(input);
  const saved = normalizePassword(stored);
  return typed.length > 0 && typed === saved;
}

const UNLOCK_KEY = "bund-house-unlock";
const FACE_KEY = "bund-house-face";

function readMap(key: string): Record<string, string | number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string | number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, string | number>) {
  localStorage.setItem(key, JSON.stringify(value));
}

function endOfToday() {
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

export function unlockedToday(id: string) {
  const until = readMap(UNLOCK_KEY)[id];
  return typeof until === "number" && until > Date.now();
}

export function unlockToday(id: string) {
  const all = readMap(UNLOCK_KEY);
  all[id] = endOfToday();
  writeMap(UNLOCK_KEY, all);
}

export async function faceAvailable() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function faceEnrolled(id: string) {
  const id64 = readMap(FACE_KEY)[id];
  return typeof id64 === "string" && id64.length > 0;
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(text: string) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function registerFace(account: { id: string; name: string }) {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "Bund House" },
        user: {
          id: new TextEncoder().encode(account.id),
          name: account.name,
          displayName: account.name,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const all = readMap(FACE_KEY);
    all[account.id] = toBase64(cred.rawId);
    writeMap(FACE_KEY, all);
    return true;
  } catch {
    return false;
  }
}

export async function verifyFace(accountId: string) {
  const stored = readMap(FACE_KEY)[accountId];
  if (typeof stored !== "string") return false;
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: fromBase64(stored) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return Boolean(cred);
  } catch {
    return false;
  }
}
