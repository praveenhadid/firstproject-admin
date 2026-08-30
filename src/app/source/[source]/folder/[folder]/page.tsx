import type { Metadata } from "next";

import { LibraryView } from "@/components/LibraryView";
import { getFolder } from "@/lib/videos";

export async function generateMetadata({
  params,
}: PageProps<"/source/[source]/folder/[folder]">): Promise<Metadata> {
  const { source, folder } = await params;
  const found = getFolder(source, folder);
  return { title: found ? `${found.label} · Video Admin` : "Video Admin" };
}

export default async function FolderPage({
  params,
}: PageProps<"/source/[source]/folder/[folder]">) {
  const { source, folder } = await params;
  return <LibraryView sourceId={source} folderId={folder} page={1} />;
}
