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

/**
 * Identifies OpenCite to the services it queries. Crossref and Open Library
 * both ask for this, and Crossref gives requests with a contact address
 * priority routing — so `CROSSREF_MAILTO` is worth setting in production.
 */
export const USER_AGENT = (() => {
  const mailto = process.env.CROSSREF_MAILTO;
  const base = 'OpenCite/0.1 (+https://github.com/kiandaga/opencite)';
  return mailto ? `${base} mailto:${mailto}` : base;
})();

export const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * `fetch` with a deadline.
 *
 * A serverless function is billed by the second and killed at its limit, so an
 * upstream that hangs must not take the whole request down with it. Each hop
 * gets its own budget and failure is reported, not waited out.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(rest.headers as Record<string, string>) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches JSON, returning `undefined` for any non-200 or unparseable body. */
export async function fetchJSON<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T | undefined> {
  try {
    const response = await fetchWithTimeout(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers as Record<string, string>) },
    });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
