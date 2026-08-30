import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import { getSources } from "@/lib/sources";

/**
 * The library catalog: which ids exist under each source, kept as plain JSON
 * that is safe to hand-edit while the server runs.
 *
 * It holds ids and scan progress only — never a URL, which stays in the
 * environment — so the file can be committed without leaking anything.
 *
 * The file is the durable record; this module keeps a copy in memory so pages
 * don't hit the disk on every request, and reloads it when the file changes
 * underneath (someone editing it by hand).
 */

export type ScanStatus = "idle" | "running" | "paused" | "done";

export type ScanState = {
  from: number;
  to: number;
  /** Next id to check; everything below this has been decided. */
  cursor: number;
  status: ScanStatus;
  checked: number;
  found: number;
  /** Probes that failed outright, worth a retry on a later pass. */
  errors: number;
  startedAt: string | null;
  updatedAt: string | null;
};

export type SourceEntry = { scan: ScanState; ids: number[] };

export type ManifestData = {
  version: 2;
  sources: Record<string, SourceEntry>;
};

type Store = {
  data: ManifestData;
  ids: Map<string, Set<number>>;
  /** Bumped on every change so derived caches know to rebuild. */
  revision: number;
  sorted: Map<string, number[]>;
  sortedAt: number;
  mtimeMs: number;
  saveTimer: ReturnType<typeof setTimeout> | null;
};

const STORE_KEY = Symbol.for("videoAdmin.manifestStore");
const SAVE_DEBOUNCE_MS = 2000;

export function manifestPath(): string {
  return resolve(process.cwd(), "data/videos-manifest.json");
}

function freshScan(from: number, to: number): ScanState {
  return {
    from,
    to,
    cursor: from,
    status: "idle",
    checked: 0,
    found: 0,
    errors: 0,
    startedAt: null,
    updatedAt: null,
  };
}

function coerceEntry(raw: unknown, from: number, to: number): SourceEntry {
  const fallback: SourceEntry = { scan: freshScan(from, to), ids: [] };
  if (!raw || typeof raw !== "object") return fallback;

  const input = raw as Partial<SourceEntry>;
  const ids = Array.isArray(input.ids)
    ? input.ids.filter(
        (value): value is number => typeof value === "number" && value >= 0,
      )
    : [];

  const scan = { ...fallback.scan, ...(input.scan ?? {}) };
  scan.from = Number.isFinite(scan.from) ? scan.from : from;
  scan.to = Number.isFinite(scan.to) ? scan.to : to;
  scan.cursor = Number.isFinite(scan.cursor)
    ? Math.max(scan.from, Math.min(scan.cursor, scan.to + 1))
    : scan.from;

  return { scan, ids: [...new Set(ids)].sort((a, b) => a - b) };
}

/**
 * Reads the file, upgrading the single-source v1 shape (`{ scan, ids }`) by
 * assigning it to the first configured source.
 */
function coerce(raw: unknown): ManifestData {
  const sources = getSources();
  const data: ManifestData = { version: 2, sources: {} };

  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const legacy =
    input.version === undefined && (input.scan !== undefined || input.ids !== undefined);

  for (const source of sources) {
    let entry: unknown = undefined;

    if (legacy && source.id === sources[0]?.id) {
      entry = { scan: input.scan, ids: input.ids };
    } else if (input.sources && typeof input.sources === "object") {
      entry = (input.sources as Record<string, unknown>)[source.id];
    }

    data.sources[source.id] = coerceEntry(entry, source.from, source.to);
  }

  // Keep entries for sources no longer configured; removing a URL from the
  // environment shouldn't throw away a scan that took hours.
  if (input.sources && typeof input.sources === "object") {
    for (const [id, entry] of Object.entries(
      input.sources as Record<string, unknown>,
    )) {
      if (!data.sources[id]) data.sources[id] = coerceEntry(entry, 1, 100000);
    }
  }

  return data;
}

function readFromDisk(): { data: ManifestData; mtimeMs: number } {
  const file = manifestPath();
  if (!existsSync(file)) return { data: coerce(null), mtimeMs: 0 };

  try {
    const mtimeMs = statSync(file).mtimeMs;
    return { data: coerce(JSON.parse(readFileSync(file, "utf8"))), mtimeMs };
  } catch {
    // Corrupt or half-written: fall back rather than crash the server.
    return { data: coerce(null), mtimeMs: 0 };
  }
}

function indexOf(data: ManifestData): Map<string, Set<number>> {
  return new Map(
    Object.entries(data.sources).map(([id, entry]) => [id, new Set(entry.ids)]),
  );
}

function createStore(): Store {
  const { data, mtimeMs } = readFromDisk();
  return {
    data,
    ids: indexOf(data),
    revision: 1,
    sorted: new Map(),
    sortedAt: 0,
    mtimeMs,
    saveTimer: null,
  };
}

function store(): Store {
  const globals = globalThis as typeof globalThis & { [STORE_KEY]?: Store };
  // Survives hot reloads in development, where modules are re-evaluated.
  if (!globals[STORE_KEY]) globals[STORE_KEY] = createStore();
  return globals[STORE_KEY];
}

/** Picks up hand edits made while the server is running. */
function syncFromDisk(): void {
  const current = store();
  const file = manifestPath();
  if (!existsSync(file)) return;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return;
  }
  if (mtimeMs === current.mtimeMs) return;

  const { data } = readFromDisk();
  current.data = data;
  current.ids = indexOf(data);
  current.mtimeMs = mtimeMs;
  current.sorted = new Map();
  current.revision += 1;
}

function entry(sourceId: string): SourceEntry {
  const current = store();
  if (!current.data.sources[sourceId]) {
    current.data.sources[sourceId] = { scan: freshScan(1, 100000), ids: [] };
    current.ids.set(sourceId, new Set());
  }
  return current.data.sources[sourceId];
}

export function saveNow(): void {
  const current = store();
  if (current.saveTimer) {
    clearTimeout(current.saveTimer);
    current.saveTimer = null;
  }

  // The scanner saves every couple of seconds, so a hand-edit made in that
  // window would otherwise be overwritten. Fold in anything that appeared on
  // disk since our last write, keeping our own sweep position.
  const file0 = manifestPath();
  if (existsSync(file0)) {
    try {
      if (statSync(file0).mtimeMs !== current.mtimeMs) {
        const { data: onDisk } = readFromDisk();
        for (const [id, external] of Object.entries(onDisk.sources)) {
          const ids = current.ids.get(id) ?? new Set<number>();
          for (const value of external.ids) ids.add(value);
          current.ids.set(id, ids);
          entry(id).scan.found = ids.size;
        }
        current.sorted = new Map();
        current.revision += 1;
      }
    } catch {
      // Unreadable mid-write; our copy is still the better one to persist.
    }
  }

  const now = new Date().toISOString();
  const payload: ManifestData = { version: 2, sources: {} };
  for (const [id, source] of Object.entries(current.data.sources)) {
    payload.sources[id] = {
      scan: { ...source.scan, updatedAt: now },
      ids: sortedIds(id),
    };
  }

  const file = manifestPath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
    current.data = payload;
    // Record our own write so it isn't mistaken for an external edit.
    current.mtimeMs = statSync(file).mtimeMs;
  } catch (error) {
    console.error("[manifest] could not write", file, error);
  }
}

function scheduleSave(): void {
  const current = store();
  if (current.saveTimer) return;
  current.saveTimer = setTimeout(() => {
    current.saveTimer = null;
    saveNow();
  }, SAVE_DEBOUNCE_MS);
  // Don't hold the process open just for a pending write.
  current.saveTimer.unref?.();
}

/** Every known id for one source, ascending. */
export function sortedIds(sourceId: string): number[] {
  const current = store();
  if (current.sortedAt !== current.revision) {
    current.sorted = new Map();
    current.sortedAt = current.revision;
  }
  const cached = current.sorted.get(sourceId);
  if (cached) return cached;

  const ids = [...(current.ids.get(sourceId) ?? [])].sort((a, b) => a - b);
  current.sorted.set(sourceId, ids);
  return ids;
}

export function getScanState(sourceId: string): ScanState {
  syncFromDisk();
  return { ...entry(sourceId).scan };
}

/** Ids for one source plus a revision number, for caching derived views. */
export function getSourceManifest(sourceId: string): {
  ids: number[];
  revision: number;
} {
  syncFromDisk();
  entry(sourceId);
  return { ids: sortedIds(sourceId), revision: store().revision };
}

export function hasVideoId(sourceId: string, id: number): boolean {
  syncFromDisk();
  return store().ids.get(sourceId)?.has(id) ?? false;
}

/** Records one probe result and moves that source's sweep forward. */
export function recordProbe(
  sourceId: string,
  id: number,
  exists: boolean,
  errored = false,
): void {
  const current = store();
  const source = entry(sourceId);
  const ids = current.ids.get(sourceId) ?? new Set<number>();
  current.ids.set(sourceId, ids);

  if (exists && !ids.has(id)) {
    ids.add(id);
    source.scan.found = ids.size;
    current.revision += 1;
  }
  if (errored) source.scan.errors += 1;

  source.scan.checked += 1;
  if (id >= source.scan.cursor) source.scan.cursor = id + 1;

  scheduleSave();
}

export function updateScan(
  sourceId: string,
  patch: Partial<ScanState>,
): ScanState {
  const current = store();
  const source = entry(sourceId);
  source.scan = { ...source.scan, ...patch };
  current.revision += 1;
  scheduleSave();
  return { ...source.scan };
}

/**
 * Aligns each source's stored window with what the environment now declares.
 *
 * The manifest remembers the window it was sweeping, so widening or narrowing
 * VIDEO_SCAN_FROM/TO in the environment would otherwise be ignored on the next
 * boot. A cursor that falls outside the new window is pulled back inside it.
 */
export function syncScanWindows(): void {
  const current = store();
  syncFromDisk();

  let changed = false;
  for (const source of getSources()) {
    const scan = entry(source.id).scan;
    if (scan.from === source.from && scan.to === source.to) continue;

    scan.from = source.from;
    scan.to = source.to;
    scan.cursor = Math.max(source.from, Math.min(scan.cursor, source.to + 1));
    // A window that was finished may have work again once it moves.
    if (scan.status === "done" && scan.cursor <= scan.to) scan.status = "idle";
    changed = true;
  }

  if (changed) {
    current.revision += 1;
    saveNow();
  }
}

/** Clears one source's found ids and rewinds its sweep. */
export function resetSource(sourceId: string, from: number, to: number): ScanState {
  const current = store();
  current.ids.set(sourceId, new Set());
  current.data.sources[sourceId] = { scan: freshScan(from, to), ids: [] };
  current.sorted = new Map();
  current.revision += 1;
  saveNow();
  return { ...current.data.sources[sourceId].scan };
}
