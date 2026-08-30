import { getSession, unauthorizedResponse } from "@/lib/auth";
import { getScanState, resetSource } from "@/lib/manifest";
import {
  activeSourceId,
  isScanning,
  pauseAll,
  pauseSource,
  resumeSource,
  startScanning,
} from "@/lib/scanner";
import { getSource, getSources } from "@/lib/sources";

function describe(sourceId: string, label: string) {
  const scan = getScanState(sourceId);
  const total = scan.to - scan.from + 1;
  const decided = Math.max(0, Math.min(scan.cursor - scan.from, total));

  return {
    ...scan,
    id: sourceId,
    label,
    active: activeSourceId() === sourceId,
    total,
    decided,
    percent: total > 0 ? Math.round((decided / total) * 1000) / 10 : 0,
  };
}

function payload() {
  const sources = getSources().map((source) => describe(source.id, source.label));
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

export async function GET() {
  if (!(await getSession())) return unauthorizedResponse();
  return Response.json(payload());
}

export async function POST(request: Request) {
  if (!(await getSession())) return unauthorizedResponse();

  let action = "";
  let sourceId: string | undefined;
  try {
    const body = (await request.json()) as {
      action?: unknown;
      source?: unknown;
    };
    action = typeof body.action === "string" ? body.action : "";
    sourceId = typeof body.source === "string" ? body.source : undefined;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (sourceId && !getSource(sourceId)) {
    return Response.json({ error: "Unknown source." }, { status: 404 });
  }

  switch (action) {
    case "start":
    case "resume":
      if (sourceId) resumeSource(sourceId);
      else {
        for (const source of getSources()) resumeSource(source.id);
      }
      startScanning();
      break;
    case "pause":
      if (sourceId) pauseSource(sourceId);
      else pauseAll();
      break;
    case "reset": {
      if (!sourceId) {
        return Response.json(
          { error: "reset needs a source." },
          { status: 400 },
        );
      }
      pauseSource(sourceId);
      const source = getSource(sourceId)!;
      resetSource(sourceId, source.from, source.to);
      break;
    }
    default:
      return Response.json(
        { error: "action must be start, pause, resume or reset." },
        { status: 400 },
      );
  }

  return Response.json(payload());
}
