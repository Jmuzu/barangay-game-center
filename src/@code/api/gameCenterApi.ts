import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GAME_CENTER_SESSION_COOKIE } from "@code/auth/parentSession";

interface ProxyOptions {
  authenticated?: boolean;
}

export async function proxyGameCenterApi(
  request: Request,
  apiPath: string,
  options: ProxyOptions = {},
): Promise<Response> {
  const baseUrl = process.env.GAME_CENTER_API_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:3200" : undefined);
  if (!baseUrl) {
    return NextResponse.json(
      { message: "Game Center API is not configured." },
      { status: 503 },
    );
  }

  const headers = new Headers();
  for (const name of ["content-type", "idempotency-key", "paymongo-signature"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  if (options.authenticated !== false) {
    const token = (await cookies()).get(GAME_CENTER_SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json(
        { message: "Barangay Platform sign-in is required." },
        { status: 401 },
      );
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = new URL(`/api/${apiPath.replace(/^\/+/, "")}`, baseUrl);
  url.search = new URL(request.url).search;
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return NextResponse.json(
      { message: "Game Center API is temporarily unavailable." },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control", "location"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}