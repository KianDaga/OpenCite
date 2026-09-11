import {
  API_ROUTES,
  identify,
  type CSLItem,
  type CitationSource,
  type LookupResponse,
  type LookupResult,
} from '@opencite/shared';
import { db } from '@/db/dexieStore';

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

/** Cached metadata never expires on its own — a published record is fixed. */
export class LookupError extends Error {
  constructor(
    message: string,
    readonly code: string = 'internal',
  ) {
    super(message);
    this.name = 'LookupError';
  }
}

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

export interface LookupOptions {
  /** Skip the cache and re-ask the source. */
  refresh?: boolean;
  signal?: AbortSignal;
}

export async function lookupMetadata(
  query: string,
  options: LookupOptions = {},
): Promise<LookupResponse> {
  const identifier = identify(query);

  if (!options.refresh && identifier.key) {
    const cached = await readCache(identifier.key);
    if (cached) return { results: [cached] };
  }

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

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new LookupError(
      body?.error?.message ?? 'The lookup failed. Please try again.',
      body?.error?.code ?? 'internal',
    );
  }

  const payload = (await response.json()) as LookupResponse;

  // Only the confident answer is worth caching; search candidates are guesses
  // and would poison the cache for that key.
  const best = payload.results[0];
  if (best && best.confidence >= 0.8) await writeCache(best);

  return payload;
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
