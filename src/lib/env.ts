/**
 * Central place for the environment variables this app runs on.
 *
 * There is no database. Credentials live here; the video sources are described
 * in `sources.ts`, and which of their files actually exist is discovered by the
 * scanner and kept in the manifest.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Username accepted by the login form. */
export function authUsername(): string {
  return process.env.AUTH_USERNAME || "admin";
}

/** Password accepted by the login form. */
export function authPassword(): string {
  return required("AUTH_PASSWORD");
}

/** Secret used to sign the session cookie. */
export function authSecret(): string {
  return required("AUTH_SECRET");
}

/** How long a session stays valid, in seconds. Defaults to 12 hours. */
export function sessionMaxAge(): number {
  const raw = process.env.SESSION_MAX_AGE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 12;
}

/** Whether the background scanner starts on its own with the server. */
export function scanEnabled(): boolean {
  const raw = (process.env.VIDEO_SCAN_ENABLED || "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

/**
 * How many probes the scanner keeps in flight. Deliberately modest: it shares
 * the server with people actually watching videos.
 */
export function scanConcurrency(): number {
  const raw = Number.parseInt(process.env.VIDEO_SCAN_CONCURRENCY || "", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 32) : 6;
}

/** How many videos go in each folder inside a link. Defaults to 1000. */
export function videoFolderSize(): number {
  const raw = process.env.VIDEO_FOLDER_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

/** How many videos to show per page. Defaults to 10. */
export function videoPageSize(): number {
  const raw = process.env.VIDEO_PAGE_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 120) : 10;
}
