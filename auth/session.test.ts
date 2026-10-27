import { describe, expect, test } from "bun:test";
import { MAX_AGE, isSignedIn, passwordMatches, readCookie, safeNext, signSession, verifySession } from "./session.ts";

const SECRET = "test-secret";

describe("session", () => {
  test("a fresh token verifies", async () => {
    expect(await verifySession(SECRET, await signSession(SECRET))).toBe(true);
  });

  test("an expired token fails", async () => {
    const token = await signSession(SECRET, 0);
    expect(await verifySession(SECRET, token, (MAX_AGE + 1) * 1000)).toBe(false);
  });

  test("a changed expiry or signature fails", async () => {
    const [expiry, sig] = (await signSession(SECRET)).split(".");
    expect(await verifySession(SECRET, `${Number(expiry) + 1000}.${sig}`)).toBe(false);
    expect(await verifySession(SECRET, `${expiry}.${sig.replace(/.$/, (c) => (c === "0" ? "1" : "0"))}`)).toBe(false);
    expect(await verifySession(SECRET, expiry)).toBe(false);
  });

  test("another secret's token fails, and an empty secret never verifies", async () => {
    expect(await verifySession("other", await signSession(SECRET))).toBe(false);
    expect(await verifySession("", await signSession(SECRET))).toBe(false);
    expect(signSession("")).rejects.toThrow();
  });

  test("isSignedIn reads the cookie", async () => {
    const token = await signSession(SECRET);
    const req = new Request("https://x/", { headers: { cookie: `a=1; kt_session=${token}` } });
    expect(readCookie(req)).toBe(token);
    expect(await isSignedIn(req, SECRET)).toBe(true);
    expect(await isSignedIn(new Request("https://x/"), SECRET)).toBe(false);
  });
});

describe("passwordMatches", () => {
  test("only the exact password matches", async () => {
    expect(await passwordMatches(SECRET, "hunter2", "hunter2")).toBe(true);
    expect(await passwordMatches(SECRET, "hunter2", "hunter")).toBe(false);
    expect(await passwordMatches(SECRET, "", "")).toBe(false);
  });
});

describe("safeNext", () => {
  test("keeps same-site paths", () => {
    expect(safeNext("/clicker-studio/")).toBe("/clicker-studio/");
    expect(safeNext("/model-maker/?x=1")).toBe("/model-maker/?x=1");
  });
  test("rejects other hosts and junk", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "", null, undefined]) expect(safeNext(bad)).toBe("/");
  });
});
