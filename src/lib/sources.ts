/**
 * A source is one link the videos are scraped from: a base URL, a file
 * extension, and the id window to sweep. Each one becomes a link folder on the
 * dashboard, holding its own folders of scraped videos.
 *
 * Sources are configured with the same suffix convention used elsewhere —
 * unsuffixed for the first, then _1, _2, _3 — and variable names are matched
 * case-insensitively.
 */

export type SourceConfig = {
  /** Stable slug derived from the URL; appears in every route. */
  id: string;
  label: string;
  /** Normalised, without a trailing slash. */
  base: string;
  extension: string;
  from: number;
  to: number;
};

function envMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.trim()) {
      map.set(key.toLowerCase(), value.trim());
    }
  }
  return map;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `https://host.example.com/files/id/` becomes `host-files-id`. */
function slugFromUrl(base: string, fallback: string): string {
  try {
    const url = new URL(base);
    const host = url.hostname.split(".")[0];
    const path = url.pathname.split("/").filter(Boolean).join("-");
    return slugify(path ? `${host}-${path}` : host) || fallback;
  } catch {
    return fallback;
  }
}

function labelFromUrl(base: string): string {
  try {
    const url = new URL(base);
    return `${url.hostname}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return base;
  }
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeExtension(raw: string | undefined): string {
  const value = (raw || ".mp4").trim();
  return value.startsWith(".") ? value : `.${value}`;
}

export function getSources(): SourceConfig[] {
  const env = envMap();

  const suffixes = new Set<string>();
  for (const key of env.keys()) {
    const match = /^video_base_url(_\d+)?$/.exec(key);
    if (match) suffixes.add(match[1] ?? "");
  }

  // Unsuffixed first, then _1, _2, … in numeric order.
  const ordered = [...suffixes].sort((a, b) => {
    if (a === b) return 0;
    if (a === "") return -1;
    if (b === "") return 1;
    return Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10);
  });

  const used = new Set<string>();

  return ordered.flatMap((suffix, index): SourceConfig[] => {
    const raw = env.get(`video_base_url${suffix}`);
    if (!raw) return [];

    const base = raw.replace(/\/+$/, "");
    let id = env.get(`video_source_id${suffix}`)
      ? slugify(env.get(`video_source_id${suffix}`)!)
      : slugFromUrl(base, `source-${index + 1}`);

    // Ids address routes and manifest entries, so they have to be unique.
    if (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);

    return [
      {
        id,
        label: env.get(`video_label${suffix}`) ?? labelFromUrl(base),
        base,
        extension: normalizeExtension(
          env.get(`video_extension${suffix}`) ?? env.get("video_extension"),
        ),
        from: toInt(
          env.get(`video_scan_from${suffix}`) ?? env.get("video_scan_from"),
          1,
        ),
        to: toInt(
          env.get(`video_scan_to${suffix}`) ?? env.get("video_scan_to"),
          100000,
        ),
      },
    ];
  });
}

export function getSource(id: string): SourceConfig | undefined {
  return getSources().find((source) => source.id === id);
}
