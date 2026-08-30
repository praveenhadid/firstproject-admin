import { scanConcurrency } from "@/lib/env";
import {
  getScanState,
  recordProbe,
  saveNow,
  updateScan,
  type ScanState,
} from "@/lib/manifest";
import { getSources, type SourceConfig } from "@/lib/sources";

/**
 * Walks each source's id space in the background while the server is up,
 * recording which files actually exist.
 *
 * Sources are swept in configured order: the first runs to completion, then
 * the next picks up automatically, so adding a second link is just an
 * environment change. A handful of HEAD requests are kept in flight and every
 * result is checkpointed, so a restart resumes where it left off.
 *
 * This needs a long-running server (`next start`, a container, a VM). On
 * serverless platforms the filesystem is read-only and processes are recycled
 * between requests, so there set VIDEO_SCAN_ENABLED=false and commit a
 * manifest generated elsewhere.
 */

type Runner = {
  running: boolean;
  /** Set only by pauseAll: ends the whole loop rather than one sweep. */
  stopAll: boolean;
  active: string | null;
};

const RUNNER_KEY = Symbol.for("videoAdmin.scanRunner");
const PROBE_TIMEOUT_MS = 15000;
/** Breather between batches so the scan never crowds out real traffic. */
const BATCH_PAUSE_MS = 150;

function runner(): Runner {
  const globals = globalThis as typeof globalThis & { [RUNNER_KEY]?: Runner };
  if (!globals[RUNNER_KEY]) {
    globals[RUNNER_KEY] = { running: false, stopAll: false, active: null };
  }
  return globals[RUNNER_KEY];
}

async function probe(url: string): Promise<"found" | "missing" | "error"> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status === 200) return "found";
    if (response.status === 404 || response.status === 403) return "missing";
    // 5xx and friends: the file may well be there, so don't rule it out.
    return "error";
  } catch {
    return "error";
  }
}

/** The next source with work left that hasn't been deliberately paused. */
function nextSource(): SourceConfig | undefined {
  return getSources().find((source) => {
    const scan = getScanState(source.id);
    return scan.status !== "paused" && scan.cursor <= scan.to;
  });
}

async function sweep(source: SourceConfig, state: Runner): Promise<void> {
  const width = scanConcurrency();
  state.active = source.id;
  updateScan(source.id, {
    status: "running",
    startedAt: getScanState(source.id).startedAt ?? new Date().toISOString(),
  });

  for (;;) {
    if (state.stopAll) {
      updateScan(source.id, { status: "paused" });
      return;
    }

    // Pausing just this link marks it paused; the loop then moves to the next.
    const scan = getScanState(source.id);
    if (scan.status === "paused") return;
    if (scan.cursor > scan.to) {
      updateScan(source.id, { status: "done" });
      return;
    }

    const batch: number[] = [];
    for (let id = scan.cursor; id <= scan.to && batch.length < width; id += 1) {
      batch.push(id);
    }

    const results = await Promise.all(
      batch.map(async (id) => ({
        id,
        outcome: await probe(`${source.base}/${id}${source.extension}`),
      })),
    );

    for (const { id, outcome } of results) {
      recordProbe(source.id, id, outcome === "found", outcome === "error");
    }

    await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
  }
}

async function loop(): Promise<void> {
  const state = runner();
  if (state.running) return;

  state.running = true;
  state.stopAll = false;

  try {
    for (;;) {
      if (state.stopAll) break;

      const source = nextSource();
      if (!source) break;

      console.log(`[scan] ${source.id}: sweeping ${source.base}`);
      await sweep(source, state);
    }
  } catch (error) {
    console.error("[scan] stopped unexpectedly", error);
    const active = runner().active;
    if (active) updateScan(active, { status: "paused" });
  } finally {
    state.running = false;
    state.active = null;
    saveNow();
  }
}

/** True while a sweep is actually in flight in this process. */
export function isScanning(): boolean {
  return runner().running;
}

/** Which source is being swept right now, if any. */
export function activeSourceId(): string | null {
  return runner().active;
}

/** Starts sweeping wherever there is work left. Returns immediately. */
export function startScanning(): void {
  if (runner().running) return;
  // Deliberately not awaited: this runs alongside request handling.
  void loop();
}

/** Clears a source's paused flag and makes sure the loop is going. */
export function resumeSource(sourceId: string): ScanState {
  const scan = getScanState(sourceId);
  if (scan.cursor > scan.to) return updateScan(sourceId, { status: "done" });

  // Only lift a pause. A sweep already in flight owns its own status, and
  // overwriting it here would show a running link as merely queued.
  const next =
    scan.status === "paused" ? updateScan(sourceId, { status: "idle" }) : scan;
  startScanning();
  return next;
}

/**
 * Pauses one source. The running sweep notices the status on its next batch
 * and returns, and the loop carries on to whichever link still has work.
 */
export function pauseSource(sourceId: string): ScanState {
  return updateScan(sourceId, { status: "paused" });
}

/** Pauses every source and ends the loop. */
export function pauseAll(): void {
  runner().stopAll = true;
  for (const source of getSources()) {
    updateScan(source.id, { status: "paused" });
  }
}
