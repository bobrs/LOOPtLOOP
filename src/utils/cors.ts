import type { Env } from "../types";

export function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const headers = new Headers(response.headers);
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("access-control-max-age", "86400");

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function corsPreflight(request: Request, env: Env): Response {
  return withCors(request, env, new Response(null, { status: 204 }));
}
