import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { FolderGrid, type FolderCard } from "@/components/FolderGrid";
import { ScanPanel } from "@/components/ScanPanel";
import { getSession } from "@/lib/auth";
import { scanInfo } from "@/lib/scan-info";
import { getFolderCover, getFolders, getSourceSummary } from "@/lib/videos";

export async function generateMetadata({
  params,
}: PageProps<"/source/[source]">): Promise<Metadata> {
  const { source } = await params;
  const found = getSourceSummary(source);
  return { title: found ? `${found.label} · Video Admin` : "Video Admin" };
}

export default async function SourcePage({
  params,
}: PageProps<"/source/[source]">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { source } = await params;
  const summary = getSourceSummary(source);
  if (!summary) notFound();

  const folders: FolderCard[] = getFolders(source).map((folder) => ({
    ...folder,
    cover: getFolderCover(source, folder.id),
  }));

  return (
    <>
      <AppHeader username={session.sub} crumbs={[{ label: summary.label }]} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {summary.label}
          </h1>
          <p className="mt-1 text-sm text-muted">
            <span className="tabular-nums text-ink">{folders.length}</span>{" "}
            {folders.length === 1 ? "folder" : "folders"},{" "}
            <span className="tabular-nums text-ink">
              {summary.count.toLocaleString()}
            </span>{" "}
            videos
          </p>
        </div>

        <ScanPanel initial={scanInfo()} sourceId={source} />
        <FolderGrid folders={folders} />
      </main>
    </>
  );
}
