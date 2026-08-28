import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Gates the whole app behind the session cookie.
 *
 * This is an optimistic check that keeps anonymous traffic away from the UI;
 * every protected route handler verifies the session again on its own.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login and logout have to stay reachable without a session.
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (session) {
    // Already signed in: no reason to show the login form again.
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/login") return NextResponse.next();

  // The API answers with JSON so fetch() callers get a status, not HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
