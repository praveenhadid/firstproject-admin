import { getSession, unauthorizedResponse } from "@/lib/auth";
import { getSourceSummaries } from "@/lib/videos";

export async function GET() {
  if (!(await getSession())) return unauthorizedResponse();
  return Response.json({ sources: getSourceSummaries() });
}
