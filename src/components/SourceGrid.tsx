import Link from "next/link";

import { VideoThumbnail } from "@/components/VideoThumbnail";
import type { SourceSummary, Video } from "@/lib/videos";

export type SourceCard = SourceSummary & { cover?: Video };

export function SourceGrid({ sources }: { sources: SourceCard[] }) {
  if (sources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-16 text-center">
        <h2 className="text-base font-medium">No links configured</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Add a{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
            VIDEO_BASE_URL
          </code>{" "}
          to your environment — numbered{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
            _1
          </code>
          ,{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
            _2
          </code>{" "}
          for more links — then restart the server.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((source) => (
        <li key={source.id}>
          <Link
            href={`/source/${encodeURIComponent(source.id)}`}
            className="group block overflow-hidden rounded-xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-hover hover:shadow-xl hover:shadow-black/40"
          >
            {/* Stacked edges read as a container of folders, not a single video. */}
            <div className="px-3 pt-3">
              <div className="mx-auto h-1 w-[78%] rounded-t bg-line-strong/40" />
              <div className="mx-auto h-1 w-[86%] rounded-t bg-line-strong/60" />
              <div className="mx-auto h-1 w-[93%] rounded-t bg-line-strong/80" />
            </div>

            <div className="px-3">
              <div className="overflow-hidden rounded-lg">
                {source.cover ? (
                  <VideoThumbnail video={source.cover} />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-surface-hover text-xs text-faint">
                    Nothing found yet
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 shrink-0 text-faint"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
                  </svg>
                  <span className="truncate">{source.label}</span>
                </h2>
                <p className="mt-0.5 text-xs text-muted tabular-nums">
                  {source.count.toLocaleString()} videos ·{" "}
                  {source.folders.toLocaleString()}{" "}
                  {source.folders === 1 ? "folder" : "folders"}
                </p>
              </div>

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
