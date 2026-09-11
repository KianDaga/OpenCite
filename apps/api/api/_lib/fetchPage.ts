import { UnsafeURLError, assertSafeUrl } from './safeUrl';
import { fetchWithTimeout } from './http';

/**
 * Fetches a web page for scraping, under three limits that a plain `fetch`
 * does not give us.
 *
 * Redirects are followed by hand so every hop can be re-checked: a public
 * hostname is free to redirect to `http://169.254.169.254/`, and letting
 * `fetch` follow that silently would defeat the guard entirely.
 *
 * The body is capped while streaming rather than after, because
 * `response.text()` on a multi-gigabyte file exhausts the function's memory
 * before any length check could run. Non-HTML responses are rejected outright
 * — a PDF or a video is not something the scraper can read.
 */

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB of HTML is already an enormous page
const MAX_REDIRECTS = 5;

export interface FetchedPage {
  html: string;
  /** The address after redirects — the one worth citing. */
  finalUrl: string;
}

export class PageFetchError extends Error {
  constructor(
    message: string,
    readonly code: 'blocked_url' | 'not_found' | 'unsupported_type' | 'timeout' | 'upstream_error',
  ) {
    super(message);
    this.name = 'PageFetchError';
  }
}

async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return '';

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
      if (total >= MAX_BYTES) break; // Enough to find a <head> many times over.
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return chunks.join('');
}

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let safe: URL;
    try {
      safe = await assertSafeUrl(current);
    } catch (error) {
      if (error instanceof UnsafeURLError) throw new PageFetchError(error.reason, 'blocked_url');
      throw error;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(safe.toString(), {
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en',
        },
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new PageFetchError(
        aborted ? 'That page took too long to respond.' : 'That page could not be reached.',
        aborted ? 'timeout' : 'upstream_error',
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new PageFetchError('That page redirected nowhere.', 'upstream_error');
      // Re-checked at the top of the next iteration, which is the point.
      current = new URL(location, safe).toString();
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      throw new PageFetchError('That page does not exist.', 'not_found');
    }

    if (!response.ok) {
      throw new PageFetchError(
        `That site responded with an error (${response.status}).`,
        'upstream_error',
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml|text\/plain|application\/xml/i.test(contentType)) {
      throw new PageFetchError(
        'That address is not a web page, so there is no metadata to read.',
        'unsupported_type',
      );
    }

    return { html: await readCapped(response), finalUrl: safe.toString() };
  }

  throw new PageFetchError('That page redirected too many times.', 'upstream_error');
}
