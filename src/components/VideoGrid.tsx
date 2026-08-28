import { VideoThumbnail } from "@/components/VideoThumbnail";
import type { Video } from "@/lib/videos";

export function VideoGrid({ videos }: { videos: Video[] }) {
  if (videos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-16 text-center">
        <h2 className="text-base font-medium">No videos configured</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Set{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
            VIDEO_BASE_URL
          </code>{" "}
          with{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
            VIDEO_ID_START
          </code>{" "}
          and{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
            VIDEO_ID_END
          </code>{" "}
          in your environment, then restart the server.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video) => (
        <li key={video.id}>
          {/*
            A plain anchor rather than next/link: each card opens its own tab,
            and prefetching a library this size would be pure waste.
          */}
          <a
            href={`/watch/${encodeURIComponent(video.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition-colors hover:border-line-strong hover:bg-surface-hover"
          >
            <div className="relative">
              <VideoThumbnail video={video} />

              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="flex size-14 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="ml-0.5 size-6 text-white"
                    aria-hidden="true"
                  >
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              <h2 className="truncate text-sm font-medium text-ink">
                {video.title}
              </h2>
              {video.description ? (
                <p className="mt-1 truncate text-xs text-muted">
                  {video.description}
                </p>
              ) : null}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
