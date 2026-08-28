import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/LogoutButton";
import { Pager } from "@/components/Pager";
import { VideoGrid } from "@/components/VideoGrid";
import { getSession } from "@/lib/auth";
import { resolvePagination } from "@/lib/pagination";
import { getVideoCount, getVideoPage } from "@/lib/videos";

export default async function LibraryPage({ searchParams }: PageProps<"/">) {
  // proxy.ts already turns anonymous traffic away; checking again here means
  // the page is safe even if the matcher ever stops covering this route.
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const pagination = resolvePagination(getVideoCount(), params.page, params.limit);
  const videos = getVideoPage(pagination.offset, pagination.pageSize);

  const first = pagination.offset + 1;
  const last = pagination.offset + videos.length;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-5"
                aria-hidden="true"
              >
                <rect x="2" y="5" width="14" height="14" rx="3" />
                <path d="m16 10 6-3.5v11L16 14" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">Video Admin</h1>
              <p className="text-xs text-faint">
                Signed in as {session.sub}
              </p>
            </div>
          </div>

          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Library</h2>
          {pagination.total > 0 ? (
            <p className="text-sm text-muted">
              Showing{" "}
              <span className="tabular-nums text-ink">
                {first}–{last}
              </span>{" "}
              of <span className="tabular-nums text-ink">{pagination.total}</span>{" "}
              videos
            </p>
          ) : null}
        </div>

        <VideoGrid videos={videos} />
        <Pager {...pagination} />
      </main>
    </>
  );
}
