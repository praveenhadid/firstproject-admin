import type { ScanInfo } from "@/components/ScanPanel";
import { getScanState } from "@/lib/manifest";
import { activeSourceId, isScanning } from "@/lib/scanner";
import { getSources } from "@/lib/sources";

/** The same shape `/api/scan` returns, for server-rendering the panel. */
export function scanInfo(): ScanInfo {
  const sources = getSources().map((source) => {
    const scan = getScanState(source.id);
    const total = scan.to - scan.from + 1;
    const decided = Math.max(0, Math.min(scan.cursor - scan.from, total));

    return {
      ...scan,
      id: source.id,
      label: source.label,
      active: activeSourceId() === source.id,
      total,
      decided,
      percent: total > 0 ? Math.round((decided / total) * 1000) / 10 : 0,
    };
  });

  const total = sources.reduce((sum, s) => sum + s.total, 0);
  const decided = sources.reduce((sum, s) => sum + s.decided, 0);

  return {
    running: isScanning(),
    activeSource: activeSourceId(),
    sources,
    overall: {
      total,
      decided,
      found: sources.reduce((sum, s) => sum + s.found, 0),
      percent: total > 0 ? Math.round((decided / total) * 1000) / 10 : 0,
    },
  };
}
