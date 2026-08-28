import { getSession, unauthorizedResponse } from "@/lib/auth";
import { resolvePagination } from "@/lib/pagination";
import { getVideoCount, getVideoPage } from "@/lib/videos";

export async function GET(request: Request) {
  if (!(await getSession())) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const { page, pageSize, total, totalPages, offset } = resolvePagination(
    getVideoCount(),
    searchParams.get("page"),
    searchParams.get("limit"),
  );

  return Response.json({
    videos: getVideoPage(offset, pageSize),
    page,
    pageSize,
    total,
    totalPages,
  });
}
