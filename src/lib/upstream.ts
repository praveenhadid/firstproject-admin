/**
 * Streams a remote file back through this app.
 *
 * Doing this rather than handing the browser the source URL buys three things:
 * the upstream address stays on the server, the media is same-origin (so a
 * canvas can grab a thumbnail frame without being tainted), and Range requests
 * still work, which is what makes seeking and frame capture possible.
 */

/** Conditional and range headers worth passing through to the origin. */
const REQUEST_HEADERS = [
  "range",
  "if-range",
  "if-none-match",
  "if-modified-since",
];

/** Headers the browser needs in order to seek and cache correctly. */
const RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

export async function proxyUpstream(
  url: string,
  request: Request,
  options: { fallbackContentType?: string } = {},
): Promise<Response> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: "Misconfigured source URL." }, { status: 500 });
  }

  // The catalog is operator-supplied, but keep it to real web protocols.
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return Response.json(
      { error: "Only http(s) sources are supported." },
      { status: 500 },
    );
  }

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const isHead = request.method === "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: isHead ? "HEAD" : "GET",
      headers,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    return Response.json(
      { error: `Could not reach the source: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    return Response.json(
      { error: `Source responded with ${upstream.status}.` },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has("content-type") && options.fallbackContentType) {
    responseHeaders.set("content-type", options.fallbackContentType);
  }
  // Tell the browser it may ask for byte ranges even if the origin stayed quiet.
  if (!responseHeaders.has("accept-ranges")) {
    responseHeaders.set("accept-ranges", "bytes");
  }
  // Signed-in users only: never let a shared cache hold on to this.
  responseHeaders.set("cache-control", "private, max-age=0, must-revalidate");

  const body =
    isHead || upstream.status === 304 || !upstream.body ? null : upstream.body;

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
