import {
  API_ROUTES,
  identify,
  type CSLItem,
  type CitationSource,
  type LookupResponse,
  type LookupResult,
} from '@opencite/shared';
import { db } from '@/db/dexieStore';
import { lookupDirect } from './direct';
import { LookupError } from './errors';

/**
 * Talks to the lookup functions, and remembers what they said.
 *
 * The `metadataCache` table means pasting the same DOI twice — in a different
 * project, a week later, or offline — resolves instantly and sends no request
 * at all. That matters beyond speed: Crossref and Open Library are free
 * services run for the community, and a citation manager that re-asks for the
 * same record every time is a bad neighbour.
 *
 * The cache key is computed by the same `identify()` the server uses, from the
 * shared package, so both sides always agree on what a given paste normalises
 * to.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Whether a lookup service is deployed alongside this build.
 *
 * Set to `false` for a static deployment — GitHub Pages, or any host that
 * serves files but does not run functions. The app is fully usable that way,
 * so the interface says so up front rather than offering a search box that
 * cannot succeed and explaining afterwards.
 */
export const LOOKUP_ENABLED = import.meta.env.VITE_LOOKUP_ENABLED !== 'false';


async function readCache(key: string): Promise<LookupResult | undefined> {
  if (!key) return undefined;
  const entry = await db.metadataCache.get(key);
  if (!entry) return undefined;
  return {
    csl: entry.csl,
    resolver: 'cache',
    key: entry.key,
    confidence: 1,
  };
}

async function writeCache(result: LookupResult): Promise<void> {
  if (!result.key) return;
  await db.metadataCache.put({
    key: result.key,
    csl: result.csl,
    resolver: result.resolver,
    fetchedAt: Date.now(),
  });
}

/** Errors that mean "no service here", as opposed to "the service said no". */
const FALLBACK_CODES = new Set(['offline', 'unavailable']);

export interface LookupOptions {
  /** Skip the cache and re-ask the source. */
  refresh?: boolean;
  signal?: AbortSignal;
}

/** Parses a JSON body, returning `null` for anything that is not JSON. */
async function readJSON(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Runs a lookup and caches a confident answer.
 *
 * Two routes. When a lookup service is deployed it handles everything,
 * including reading web pages. When one is not, the browser talks to Crossref,
 * Open Library and DataCite itself — they all allow cross-origin requests — so
 * DOIs, ISBNs, arXiv ids and title searches still work with no backend at all.
 * The server route falls back to the direct one if it fails, because a
 * temporarily unreachable service is no reason to refuse a lookup the browser
 * could have done unaided.
 */
export async function lookupMetadata(
  query: string,
  options: LookupOptions = {},
): Promise<LookupResponse> {
  const identifier = identify(query);

  if (!options.refresh && identifier.key) {
    const cached = await readCache(identifier.key);
    if (cached) return { results: [cached] };
  }

  const payload = LOOKUP_ENABLED
    ? await viaService(query, options).catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') throw error;
        // Fall back only when the service could not be reached. A refusal it
        // issued deliberately — a blocked address, a malformed request — is an
        // answer, and replacing it with a guess would hide the real reason.
        if (error instanceof LookupError && !FALLBACK_CODES.has(error.code)) throw error;
        return lookupDirect(query);
      })
    : await lookupDirect(query);

  // Only a confident answer is worth caching; search candidates are guesses
  // and would poison the cache for that key.
  const best = payload.results[0];
  if (best && best.confidence >= 0.8) await writeCache(best);

  return payload;
}

async function viaService(query: string, options: LookupOptions): Promise<LookupResponse> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}${API_ROUTES.lookupAuto}?query=${encodeURIComponent(query)}`,
      { signal: options.signal ?? null },
    );
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new LookupError(
      'Could not reach the lookup service. Check your connection — everything already in your library still works offline.',
      'offline',
    );
  }

  const body = await readJSON(response);

  if (!response.ok) {
    // A 404 with no JSON body means there is no lookup service at this
    // address, even though this build expected one. Falling back to the direct
    // resolvers is better than reporting a failure.
    if (!body) throw new LookupError('No lookup service at that address.', 'unavailable');

    const error = (body as { error?: { code?: string; message?: string } }).error;
    throw new LookupError(
      error?.message ?? 'The lookup failed. Please try again.',
      error?.code ?? 'internal',
    );
  }

  // Static hosts with a single-page fallback answer *any* path with 200 and
  // index.html, so a successful status is not proof we reached the API.
  if (!body || !Array.isArray((body as LookupResponse).results)) {
    throw new LookupError('That address did not answer with a lookup result.', 'unavailable');
  }

  return body as LookupResponse;
}

/** Provenance to store alongside a citation added from a lookup. */
export function sourceFor(query: string, result: LookupResult): CitationSource {
  const identifier = identify(query);
  return {
    kind: identifier.kind === 'unknown' ? 'manual' : identifier.kind,
    input: query,
    key: result.key || identifier.key,
    resolver: result.resolver,
    fetchedAt: Date.now(),
  };
}

/** Strips the resolver's id so the citation gets the library's own. */
export function cslForStorage(result: LookupResult): Omit<CSLItem, 'id'> {
  const { id: _ignored, ...csl } = result.csl;
  return csl;
}
