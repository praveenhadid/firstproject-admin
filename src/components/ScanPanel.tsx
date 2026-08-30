"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SourceScan = {
  id: string;
  label: string;
  status: "idle" | "running" | "paused" | "done";
  active: boolean;
  from: number;
  to: number;
  cursor: number;
  found: number;
  errors: number;
  total: number;
  decided: number;
  percent: number;
};

export type ScanInfo = {
  running: boolean;
  activeSource: string | null;
  sources: SourceScan[];
  overall: { total: number; decided: number; found: number; percent: number };
};

const POLL_MS = 4000;

const LABELS: Record<SourceScan["status"], string> = {
  idle: "Queued",
  running: "Scanning",
  paused: "Paused",
  done: "Complete",
};

const DOTS: Record<SourceScan["status"], string> = {
  idle: "bg-faint",
  running: "bg-accent animate-pulse",
  paused: "bg-amber-400",
  done: "bg-emerald-400",
};

export function ScanPanel({
  initial,
  /** Show only this link's row, on a link's own page. */
  sourceId,
}: {
  initial: ScanInfo;
  sourceId?: string;
}) {
  const router = useRouter();
  const [info, setInfo] = useState<ScanInfo>(initial);
  const [busy, setBusy] = useState(false);

  const rows = sourceId
    ? info.sources.filter((source) => source.id === sourceId)
    : info.sources;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/scan", { cache: "no-store" });
      if (response.ok) return (await response.json()) as ScanInfo;
    } catch {
      // A dropped poll is not worth surfacing; the next one will catch up.
    }
    return null;
  }, []);

  // Poll while a sweep is live so the numbers move on their own.
  useEffect(() => {
    if (!info.running) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      const next = await refresh();
      if (cancelled || !next) return;

      setInfo((previous) => {
        // New folders appear as each source crosses another thousand.
        if (
          Math.floor(next.overall.found / 1000) !==
          Math.floor(previous.overall.found / 1000)
        ) {
          router.refresh();
        }
        return next;
      });
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [info.running, refresh, router]);

  async function send(action: string, source?: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source ? { action, source } : { action }),
      });
      if (response.ok) {
        setInfo((await response.json()) as ScanInfo);
        router.refresh();
      }
    } catch {
      // Leave the panel as it was; the poll will resync.
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <p className="text-sm font-medium">
            {sourceId ? "Scan" : "Library scan"}
          </p>
          <p className="mt-0.5 text-xs text-muted tabular-nums">
            {info.overall.found.toLocaleString()} working videos ·{" "}
            {info.overall.decided.toLocaleString()} of{" "}
            {info.overall.total.toLocaleString()} ids checked
            {info.running ? " · runs while the site is up" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {info.running ? (
            <button
              type="button"
              onClick={() => send("pause", sourceId)}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60"
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send("resume", sourceId)}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((source) => (
          <li key={source.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`size-2 shrink-0 rounded-full ${DOTS[source.status]}`}
                  aria-hidden="true"
                />
                <p className="truncate text-sm text-ink">{source.label}</p>
                <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                  {LABELS[source.status]}
                </span>
              </div>

              <p className="text-xs text-muted tabular-nums">
                {source.found.toLocaleString()} found · id{" "}
                {source.cursor.toLocaleString()} of {source.to.toLocaleString()} ·{" "}
                {source.percent}%
              </p>
            </div>

            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"
              role="progressbar"
              aria-valuenow={source.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Scan progress for ${source.label}`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${
                  source.status === "done" ? "bg-emerald-400" : "bg-accent"
                }`}
                style={{ width: `${Math.min(100, Math.max(source.percent, 0.5))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
