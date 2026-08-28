import { cookies } from "next/headers";

import { verifyCredentials } from "@/lib/auth";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

export async function POST(request: Request) {
  let username = "";
  let password = "";

  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const fields = body as Record<string, unknown>;
      username = typeof fields.username === "string" ? fields.username : "";
      password = typeof fields.password === "string" ? fields.password : "";
    }
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!username || !password) {
    return Response.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  if (!(await verifyCredentials(username, password))) {
    // Deliberately vague: don't reveal which half was wrong.
    return Response.json(
      { error: "Incorrect username or password." },
      { status: 401 },
    );
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(username), sessionCookieOptions());

  return Response.json({ ok: true, user: { username } });
}
