import { getSession, unauthorizedResponse } from "@/lib/auth";
import { getVideoSource, toPublicVideo } from "@/lib/videos";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) return unauthorizedResponse();

  const { id } = await params;
  const video = getVideoSource(id);
  if (!video) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ video: toPublicVideo(video) });
}
