import { cookies } from "next/headers";

import { authPassword, authSecret, authUsername } from "@/lib/env";
import {
  SESSION_COOKIE,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

const encoder = new TextEncoder();

/**
 * Compares two strings by their HMAC digests so that the time taken does not
 * depend on how many leading characters happen to match.
 */
async function safeEquals(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = viewA.length ^ viewB.length;
  for (let i = 0; i < viewA.length; i += 1) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

/** Checks a username/password pair against the values in the environment. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const [userOk, passOk] = await Promise.all([
    safeEquals(username, authUsername()),
    safeEquals(password, authPassword()),
  ]);
  return userOk && passOk;
}

/** Reads and verifies the session cookie on the current request. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Server-side guard for route handlers. `proxy.ts` already turns anonymous
 * traffic away, but every protected endpoint re-checks so that authorization
 * never depends on the matcher staying correct.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** JSON 401 used by the API routes. */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
