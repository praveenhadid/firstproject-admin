import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return Response.json({ authenticated: false }, { status: 200 });
  }

  return Response.json({
    authenticated: true,
    user: { username: session.sub },
    expiresAt: new Date(session.exp * 1000).toISOString(),
  });
}
