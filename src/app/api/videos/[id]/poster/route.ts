import { getSession, unauthorizedResponse } from "@/lib/auth";
import { proxyUpstream } from "@/lib/upstream";
import { getVideoSource } from "@/lib/videos";

export const dynamic = "force-dynamic";

async function handle(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) return unauthorizedResponse();

  const { id } = await params;
  const video = getVideoSource(id);
  if (!video?.poster) {
    // No configured thumbnail: the client falls back to capturing a frame.
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return proxyUpstream(video.poster, request, {
    fallbackContentType: "image/jpeg",
  });
}

export const GET = handle;
export const HEAD = handle;
