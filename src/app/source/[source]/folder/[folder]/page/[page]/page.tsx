import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LibraryView } from "@/components/LibraryView";
import { paginate } from "@/lib/pagination";
import { getFolder } from "@/lib/videos";

/** Parses `/page/<n>`, rejecting anything that isn't a plain page number. */
function parsePage(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 1 ? value : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/source/[source]/folder/[folder]/page/[page]">): Promise<Metadata> {
  const { source, folder, page } = await params;
  const found = getFolder(source, folder);
  const parsed = parsePage(page);
  if (!found) return { title: "Video Admin" };
  return {
    title: parsed ? `${found.label} · Page ${parsed}` : `${found.label} · Video Admin`,
  };
}

export default async function FolderPagedPage({
  params,
}: PageProps<"/source/[source]/folder/[folder]/page/[page]">) {
  const { source, folder, page } = await params;

  const found = getFolder(source, folder);
  if (!found) notFound();

  const parsed = parsePage(page);
  if (parsed === null) notFound();

  const basePath = `/source/${encodeURIComponent(source)}/folder/${encodeURIComponent(found.id)}`;
  // Page one is the folder itself, so keep a single canonical URL for it.
  if (parsed === 1) redirect(basePath);

  // Past the end of the folder is a 404 rather than a silently clamped page.
  const { totalPages } = paginate(found.count, 1);
  if (parsed > totalPages) notFound();

  return <LibraryView sourceId={source} folderId={found.id} page={parsed} />;
}
