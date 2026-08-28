import { authSecret, sessionMaxAge } from "@/lib/env";

/** Name of the signed session cookie. */
export const SESSION_COOKIE = "fp_admin_session";

export type SessionPayload = {
  /** Subject — the logged in username. */
  sub: string;
  /** Issued at, seconds since epoch. */
  iat: number;
  /** Expires at, seconds since epoch. */
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  // Backed by a plain ArrayBuffer so it satisfies BufferSource for WebCrypto.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Signs a session as `<base64url payload>.<base64url HMAC-SHA256>`.
 * Small enough for a cookie and verifiable without any storage.
 */
export async function createSessionToken(username: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: issuedAt,
    exp: issuedAt + sessionMaxAge(),
  };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(body),
  );
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/** Returns the payload of a valid, unexpired token, or null. */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      base64UrlToBytes(signature),
      encoder.encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      decoder.decode(base64UrlToBytes(body)),
    ) as SessionPayload;

    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) return null;

    return payload;
  } catch {
    // Malformed base64, malformed JSON, or a bad signature: all mean "no session".
    return null;
  }
}

/** Cookie options shared by the login and logout routes. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge(),
  };
}
