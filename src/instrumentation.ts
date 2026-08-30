/**
 * Runs once when a server instance starts. Used to bring the background
 * scanner back up so a restart resumes the sweep on its own.
 */
export async function register() {
  // Also loaded for the edge runtime, where there is no filesystem to write to.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { scanEnabled } = await import("@/lib/env");
  if (!scanEnabled()) return;

  const { getScanState, syncScanWindows } = await import("@/lib/manifest");
  const { startScanning } = await import("@/lib/scanner");
  const { getSources } = await import("@/lib/sources");

  const sources = getSources();
  if (sources.length === 0) {
    console.warn("[scan] no VIDEO_BASE_URL configured; nothing to scan.");
    return;
  }

  // A changed VIDEO_SCAN_FROM/TO should take effect on the next boot.
  syncScanWindows();

  // Anything but a deliberate pause resumes on boot.
  const pending = sources.filter((source) => {
    const scan = getScanState(source.id);
    return scan.status !== "paused" && scan.cursor <= scan.to;
  });

  if (pending.length === 0) {
    console.log("[scan] nothing to resume; paused or complete.");
    return;
  }

  for (const source of pending) {
    const scan = getScanState(source.id);
    console.log(
      `[scan] ${source.id}: resuming at ${scan.cursor} of ${scan.to} (${scan.found} found)`,
    );
  }

  // register() must not block the server from becoming ready.
  startScanning();
}
