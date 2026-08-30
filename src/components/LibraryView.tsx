import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { Pager } from "@/components/Pager";
import { VideoGrid } from "@/components/VideoGrid";
import { getSession } from "@/lib/auth";
import { paginate } from "@/lib/pagination";
import { getFolder, getSourceSummary, getVideoPage } from "@/lib/videos";

/** One page of one folder inside one link. */
export async function LibraryView({
  sourceId,
  folderId,
  page,
}: {
  sourceId: string;
  folderId: string;
  page: number;
}) {
  // proxy.ts already turns anonymous traffic away; checking again here means
  // the page is safe even if the matcher ever stops covering this route.
  const session = await getSession();
  if (!session) redirect("/login");

  const source = getSourceSummary(sourceId);
  const folder = getFolder(sourceId, folderId);
  if (!source || !folder) notFound();

  const pagination = paginate(folder.count, page);
  const videos = getVideoPage(
    sourceId,
    folder.id,
    pagination.offset,
    pagination.pageSize,
  );

  const sourcePath = `/source/${encodeURIComponent(source.id)}`;
  const basePath = `${sourcePath}/folder/${encodeURIComponent(folder.id)}`;
  const first = pagination.offset + 1;
  const last = pagination.offset + videos.length;

  return (
    <>
      <AppHeader
        username={session.sub}
        crumbs={[
          { label: source.label, href: sourcePath },
          { label: folder.label },
        ]}
      />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {folder.label}
            </h1>
            {folder.count > 0 ? (
              <p className="mt-1 text-sm text-muted">
                <span className="tabular-nums text-ink">
                  {first}–{last}
                </span>{" "}
                of{" "}
                <span className="tabular-nums text-ink">
                  {folder.count.toLocaleString()}
                </span>
              </p>
            ) : null}
          </div>

          {pagination.totalPages > 1 ? (
            <p className="text-sm text-faint">
              Page{" "}
              <span className="tabular-nums text-muted">{pagination.page}</span>{" "}
              of{" "}
              <span className="tabular-nums text-muted">
                {pagination.totalPages}
              </span>
            </p>
          ) : null}
        </div>

        <VideoGrid videos={videos} />
        <Pager {...pagination} basePath={basePath} />
      </main>
    </>
  );
}
