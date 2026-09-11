import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, resetDatabase } from '@/db/dexieStore';
import { LookupError, lookupMetadata, sourceFor } from '@/lookup';

const DOI_RESPONSE = {
  results: [
    {
      csl: {
        id: '10.1038/nature12373',
        type: 'article-journal',
        title: 'Nanometre-scale thermometry in a living cell',
      },
      resolver: 'crossref',
      key: 'doi:10.1038/nature12373',
      confidence: 0.97,
    },
  ],
};

function mockApi(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  await db.open();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lookup client', () => {
  it('caches a confident result and answers the next paste without a request', async () => {
    // Crossref and Open Library are free services; re-asking for a record we
    // already hold is both slower and a poor way to treat them.
    const fetchMock = mockApi(DOI_RESPONSE);

    await lookupMetadata('10.1038/nature12373');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await db.metadataCache.get('doi:10.1038/nature12373')).toBeDefined();

    const second = await lookupMetadata('https://doi.org/10.1038/NATURE12373');

    // Same record, differently pasted — the shared `identify()` normalises
    // both to one key, so no second request goes out.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.results[0]?.resolver).toBe('cache');
  });

  it('re-asks when explicitly refreshed', async () => {
    const fetchMock = mockApi(DOI_RESPONSE);
    await lookupMetadata('10.1038/nature12373');
    await lookupMetadata('10.1038/nature12373', { refresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache low-confidence search guesses', async () => {
    // A title-search match is a candidate, not an answer; caching it would
    // make a guess permanent for that key.
    mockApi({
      results: [{ ...DOI_RESPONSE.results[0], confidence: 0.5, key: 'doi:10.1/guess' }],
    });

    await lookupMetadata('some article title');
    expect(await db.metadataCache.get('doi:10.1/guess')).toBeUndefined();
  });

  it('passes the server s explanation through instead of a generic failure', async () => {
    mockApi({ error: { code: 'blocked_url', message: 'That address points at a private network.' } }, false, 400);

    await expect(lookupMetadata('http://127.0.0.1/')).rejects.toThrow(
      /private network/,
    );
  });

  it('says the library still works when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(lookupMetadata('10.1038/nature12373')).rejects.toBeInstanceOf(LookupError);
    await expect(lookupMetadata('10.1038/nature12373')).rejects.toThrow(/offline/i);
  });

  it('records where a citation came from', async () => {
    const source = sourceFor('https://doi.org/10.1038/nature12373', DOI_RESPONSE.results[0] as never);

    expect(source.kind).toBe('doi');
    expect(source.key).toBe('doi:10.1038/nature12373');
    expect(source.resolver).toBe('crossref');
    expect(source.input).toBe('https://doi.org/10.1038/nature12373');
  });
});
