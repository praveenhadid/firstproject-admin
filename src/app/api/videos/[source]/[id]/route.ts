import { getSession, unauthorizedResponse } from "@/lib/auth";
import { getVideoSource, toPublicVideo } from "@/lib/videos";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  if (!(await getSession())) return unauthorizedResponse();

  const { source, id } = await params;
  const video = getVideoSource(source, id);
  if (!video) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ video: toPublicVideo(video) });
}
