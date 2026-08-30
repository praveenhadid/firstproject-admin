import Link from "next/link";

import { VideoThumbnail } from "@/components/VideoThumbnail";
import type { Folder, Video } from "@/lib/videos";

export type FolderCard = Folder & { cover?: Video };

export function FolderGrid({ folders }: { folders: FolderCard[] }) {
  if (folders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-16 text-center">
        <h2 className="text-base font-medium">Nothing found here yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          The scanner hasn&apos;t found any working videos under this link yet.
          A folder appears here for every 1,000 it finds.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {folders.map((folder) => (
        <li key={folder.id}>
          <Link
            href={`/source/${encodeURIComponent(folder.sourceId)}/folder/${encodeURIComponent(folder.id)}`}
            className="group block overflow-hidden rounded-xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-hover hover:shadow-xl hover:shadow-black/40"
          >
            {/* The stacked edges above the cover read as a folder of many. */}
            <div className="px-3 pt-3">
              <div className="mx-auto h-1 w-[82%] rounded-t bg-line-strong/50" />
              <div className="mx-auto h-1 w-[91%] rounded-t bg-line-strong/70" />
            </div>

            <div className="px-3">
              <div className="overflow-hidden rounded-lg">
                {folder.cover ? (
                  <VideoThumbnail video={folder.cover} />
                ) : (
                  <div className="aspect-video w-full bg-surface-hover" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-medium text-ink">
                  {folder.label}
                </h2>
                <p className="mt-0.5 text-xs text-muted tabular-nums">
                  {folder.count.toLocaleString()}{" "}
                  {folder.count === 1 ? "video" : "videos"}
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
