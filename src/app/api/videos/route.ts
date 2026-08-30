import { getSession, unauthorizedResponse } from "@/lib/auth";
import { resolvePagination } from "@/lib/pagination";
import { getFolder, getFolders, getVideoPage } from "@/lib/videos";
import { getSources } from "@/lib/sources";

export async function GET(request: Request) {
  if (!(await getSession())) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);

  // Without ?source= or ?folder=, answer for the first of each.
  const sourceId = searchParams.get("source") ?? getSources()[0]?.id;
  if (!sourceId) {
    return Response.json({ error: "No sources configured." }, { status: 404 });
  }

  const requested = searchParams.get("folder");
  const folder = requested
    ? getFolder(sourceId, requested)
    : getFolders(sourceId)[0];
  if (!folder) {
    return Response.json({ error: "Unknown folder." }, { status: 404 });
  }

  const { page, pageSize, total, totalPages, offset } = resolvePagination(
    folder.count,
    searchParams.get("page"),
    searchParams.get("limit"),
  );

  return Response.json({
    source: sourceId,
    folder: { id: folder.id, label: folder.label },
    videos: getVideoPage(sourceId, folder.id, offset, pageSize),
    page,
    pageSize,
    total,
    totalPages,
  });
}
