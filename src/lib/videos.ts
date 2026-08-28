import defaultVideos from "@/data/videos.json";
import {
  videoBaseUrl,
  videoExtension,
  videoIdRange,
  videosJson,
} from "@/lib/env";

/** A video as configured on the server. `url` never leaves the server. */
export type VideoSource = {
  id: string;
  title: string;
  url: string;
  description?: string;
  /** Optional thumbnail URL. When absent the browser grabs a frame instead. */
  poster?: string;
};

/** The shape sent to the browser: proxied URLs only, no upstream address. */
export type Video = {
  id: string;
  title: string;
  description?: string;
  streamUrl: string;
  posterUrl?: string;
};

/**
 * Two ways to describe a library:
 *
 * - `list`  — an explicit array, from VIDEOS_JSON or src/data/videos.json.
 * - `range` — a base URL plus a run of numbered files, e.g. 71459.mp4 through
 *   72669.mp4. Kept as bounds rather than an expanded array so that looking a
 *   video up stays O(1) even across thousands of files; the stream route does
 *   this on every byte-range request.
 */
type Catalog =
  | { kind: "list"; items: VideoSource[]; byId: Map<string, VideoSource> }
  | {
      kind: "range";
      base: string;
      start: number;
      end: number;
      extension: string;
      pad: number;
    };

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function parseList(entries: unknown, origin: string): VideoSource[] {
  if (!Array.isArray(entries)) {
    throw new Error(`${origin} must be a JSON array.`);
  }

  const seen = new Set<string>();

  return entries.flatMap((entry, index): VideoSource[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) return [];

    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : `Video ${index + 1}`;

    let id =
      typeof item.id === "string" && item.id.trim()
        ? slugify(item.id, `video-${index + 1}`)
        : slugify(title, `video-${index + 1}`);

    // Ids address the stream route, so they have to be unique.
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);

    return [
      {
        id,
        title,
        url,
        description:
          typeof item.description === "string" ? item.description : undefined,
        poster: typeof item.poster === "string" ? item.poster : undefined,
      },
    ];
  });
}

function toListCatalog(items: VideoSource[]): Catalog {
  return {
    kind: "list",
    items,
    byId: new Map(items.map((item) => [item.id, item])),
  };
}

function buildCatalog(): Catalog {
  const json = videosJson();
  if (json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(
        `VIDEOS_JSON is not valid JSON: ${(error as Error).message}`,
      );
    }
    return toListCatalog(parseList(parsed, "VIDEOS_JSON"));
  }

  const base = videoBaseUrl()?.trim();
  if (base) {
    const { start: rawStart, end: rawEnd } = videoIdRange();
    const start = Number.parseInt(rawStart ?? "", 10);
    const end = Number.parseInt(rawEnd ?? "", 10);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(
        "VIDEO_BASE_URL is set, so VIDEO_ID_START and VIDEO_ID_END must both be numbers.",
      );
    }
    if (end < start) {
      throw new Error("VIDEO_ID_END must be greater than or equal to VIDEO_ID_START.");
    }

    return {
      kind: "range",
      base: base.replace(/\/+$/, ""),
      start,
      end,
      extension: videoExtension(),
      // Only pad when the configured start actually carries leading zeros.
      pad: rawStart?.startsWith("0") ? rawStart.length : 0,
    };
  }

  return toListCatalog(parseList(defaultVideos, "src/data/videos.json"));
}

// Env is fixed for the life of the process, so build the catalog once.
let cached: Catalog | undefined;

function catalog(): Catalog {
  if (!cached) cached = buildCatalog();
  return cached;
}

function rangeItem(
  entry: Extract<Catalog, { kind: "range" }>,
  value: number,
): VideoSource {
  const id = String(value).padStart(entry.pad, "0");
  return {
    id,
    title: id,
    url: `${entry.base}/${id}${entry.extension}`,
  };
}

/** Total number of videos in the library. */
export function getVideoCount(): number {
  const entry = catalog();
  return entry.kind === "list" ? entry.items.length : entry.end - entry.start + 1;
}

/**
 * One page of videos. Slicing here rather than in the page component means a
 * range catalog is never expanded into a full array.
 */
export function getVideoSourcePage(
  offset: number,
  limit: number,
): VideoSource[] {
  const entry = catalog();
  const total = getVideoCount();
  const from = Math.max(0, Math.min(offset, total));
  const to = Math.max(from, Math.min(from + limit, total));

  if (entry.kind === "list") return entry.items.slice(from, to);

  const page: VideoSource[] = [];
  for (let index = from; index < to; index += 1) {
    page.push(rangeItem(entry, entry.start + index));
  }
  return page;
}

/** One configured video by id, or undefined. Server use only. */
export function getVideoSource(id: string): VideoSource | undefined {
  const entry = catalog();
  if (entry.kind === "list") return entry.byId.get(id);

  // Reject anything that isn't a plain number inside the configured bounds,
  // so an id can never be used to point the proxy at another path.
  if (!/^\d+$/.test(id)) return undefined;
  const value = Number.parseInt(id, 10);
  if (!Number.isFinite(value) || value < entry.start || value > entry.end) {
    return undefined;
  }
  return rangeItem(entry, value);
}

/** Strips the upstream URL and points the client at our own API instead. */
export function toPublicVideo(video: VideoSource): Video {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    streamUrl: `/api/videos/${encodeURIComponent(video.id)}/stream`,
    posterUrl: video.poster
      ? `/api/videos/${encodeURIComponent(video.id)}/poster`
      : undefined,
  };
}

/** One page of the catalog as the browser sees it. */
export function getVideoPage(offset: number, limit: number): Video[] {
  return getVideoSourcePage(offset, limit).map(toPublicVideo);
}
