import { getSession, unauthorizedResponse } from "@/lib/auth";
import { proxyUpstream } from "@/lib/upstream";
import { getVideoSource } from "@/lib/videos";

/** Range requests differ per call, so this must never be cached or prerendered. */
export const dynamic = "force-dynamic";

async function handle(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) return unauthorizedResponse();

  const { id } = await params;
  const video = getVideoSource(id);
  if (!video) return Response.json({ error: "Not found." }, { status: 404 });

  return proxyUpstream(video.url, request, {
    fallbackContentType: "video/mp4",
  });
}

export const GET = handle;
export const HEAD = handle;
