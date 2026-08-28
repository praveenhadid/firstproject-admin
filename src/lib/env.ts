/**
 * Central place for the environment variables this app runs on.
 * There is no database: credentials and the video catalog both come from
 * the environment.
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

/** Optional JSON array of videos. Takes precedence over the numbered range. */
export function videosJson(): string | undefined {
  return process.env.VIDEOS_JSON;
}

/** Directory the numbered video files live under, e.g. `https://host/files/`. */
export function videoBaseUrl(): string | undefined {
  return process.env.VIDEO_BASE_URL;
}

/** First and last file number in the range, inclusive. */
export function videoIdRange(): { start?: string; end?: string } {
  return {
    start: process.env.VIDEO_ID_START,
    end: process.env.VIDEO_ID_END,
  };
}

/** File extension for the numbered range. Defaults to `.mp4`. */
export function videoExtension(): string {
  const raw = (process.env.VIDEO_EXTENSION || ".mp4").trim();
  return raw.startsWith(".") ? raw : `.${raw}`;
}

/** How many videos to show per page. Defaults to 24. */
export function videoPageSize(): number {
  const raw = process.env.VIDEO_PAGE_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 120) : 24;
}
