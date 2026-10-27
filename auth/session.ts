// The team-password session: a cookie "<expiry>.<HMAC-SHA256(AUTH_SECRET, expiry)>".
// Web Crypto only, so it runs in Routing Middleware, Vercel Functions and bun test.

export const COOKIE = "kt_session";
export const MAX_AGE = 30 * 24 * 60 * 60; // seconds

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A session token valid until `now + MAX_AGE`. */
export async function signSession(secret: string, now = Date.now()): Promise<string> {
  const expiry = String(Math.floor(now / 1000) + MAX_AGE);
  return `${expiry}.${hex(await hmac(secret, expiry))}`;
}

export async function verifySession(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret || !token) return false;
  const [expiry, signature] = token.split(".");
  if (!/^\d+$/.test(expiry ?? "") || Number(expiry) * 1000 <= now) return false;
  return sameBytes(encoder.encode(hex(await hmac(secret, expiry))), encoder.encode(signature ?? ""));
}

/** Constant-time password check: compares HMACs, so lengths and prefixes don't leak. */
export async function passwordMatches(secret: string, expected: string, given: string): Promise<boolean> {
  if (!expected) return false;
  return sameBytes(await hmac(secret, `pw:${expected}`), await hmac(secret, `pw:${given}`));
}

export function readCookie(request: Request, name = COOKIE): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearedCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Where to go after logging in: a same-site path only, never another host. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export async function isSignedIn(request: Request, secret = process.env.AUTH_SECRET ?? ""): Promise<boolean> {
  return verifySession(secret, readCookie(request));
}
