import type { ApiError, LookupResponse } from '@opencite/shared';

/**
 * Small helpers shared by every handler. Handlers take a Web `Request` and
 * return a Web `Response`, which keeps them portable across hosts and trivial
 * to unit test — no framework mock required.
 */

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function ok(body: LookupResponse, cacheSeconds = 86_400): Response {
  return json(body, {
    headers: { 'Cache-Control': `public, s-maxage=${cacheSeconds}, stale-while-revalidate=604800` },
  });
}

export function fail(
  code: ApiError['error']['code'],
  message: string,
  status = 400,
): Response {
  return json({ error: { code, message } } satisfies ApiError, { status });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Reads and trims a query parameter, returning `undefined` when blank. */
export function param(request: Request, name: string): string | undefined {
  const value = new URL(request.url).searchParams.get(name)?.trim();
  return value ? value : undefined;
}

/** Placeholder until Step 3 wires up the real resolvers. */
export function notImplemented(route: string): Response {
  return fail('internal', `${route} is implemented in Step 3.`, 501);
}
