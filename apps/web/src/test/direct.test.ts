import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookupOffline, UrlLookupUnavailable, lookupDirect } from '@/lookup';

/**
 * The resolvers that run in the browser with no server behind them. Crossref,
 * Open Library and DataCite all allow cross-origin requests, which is what
 * makes autocite work on a static deployment.
 */
function mockUpstreams(routes: Array<[RegExp, unknown | null]>, { offline = false } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      if (offline) throw new TypeError('Failed to fetch');
      for (const [pattern, body] of routes) {
        if (pattern.test(url)) {
          if (body === null) return { ok: false, status: 404, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => body };
        }
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
  return calls;
}

const CROSSREF = {
  message: {
    DOI: '10.1038/nature12373',
    type: 'journal-article',
    title: ['A paper'],
    'container-title': ['Nature'],
    author: [{ given: 'G.', family: 'Kucsko' }],
    issued: { 'date-parts': [[2013, 7, 31]] },
  },
};

const OPENLIBRARY = {
  'ISBN:9780226025988': {
    title: 'The Human Condition',
    authors: [{ name: 'Hannah Arendt' }],
    publishers: [{ name: 'University of Chicago Press' }],
    publish_date: '1998',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('browser-side lookup', () => {
  it('resolves a DOI against Crossref', async () => {
    mockUpstreams([[/api\.crossref\.org/, CROSSREF]]);
    const { results } = await lookupDirect('10.1038/nature12373');

    expect(results[0]?.resolver).toBe('crossref');
    // The mapping is the same code the server uses.
    expect(results[0]?.csl.type).toBe('article-journal');
    expect(results[0]?.csl['container-title']).toBe('Nature');
  });

  it('resolves an ISBN against Open Library', async () => {
    mockUpstreams([[/openlibrary\.org/, OPENLIBRARY]]);
    const { results } = await lookupDirect('978-0-226-02598-8');

    expect(results[0]?.csl.title).toBe('The Human Condition');
    expect(results[0]?.csl.author?.[0]).toEqual({ family: 'Arendt', given: 'Hannah' });
  });

  it('resolves an arXiv id through its minted DOI', async () => {
    const calls = mockUpstreams([[/api\.crossref\.org/, CROSSREF]]);
    const { results } = await lookupDirect('arXiv:2103.00020');

    expect(calls[0]).toContain(encodeURIComponent('10.48550/arXiv.2103.00020'));
    expect(results[0]?.key).toBe('arxiv:2103.00020');
  });

  it('searches Crossref for a plain title', async () => {
    const calls = mockUpstreams([
      [/api\.crossref\.org\/works\?/, { message: { items: [CROSSREF.message] } }],
    ]);
    const { results } = await lookupDirect('nanometre scale thermometry');

    expect(calls[0]).toContain('query.bibliographic');
    expect(results[0]?.confidence).toBeLessThan(0.7);
  });

  it('falls back from Crossref to DataCite', async () => {
    mockUpstreams([
      [/api\.crossref\.org/, null],
      [
        /api\.datacite\.org/,
        {
          data: {
            attributes: {
              doi: '10.5281/zenodo.31780',
              titles: [{ title: 'A dataset' }],
              types: { citeproc: 'dataset' },
              publicationYear: 2015,
            },
          },
        },
      ],
    ]);
    const { results } = await lookupDirect('10.5281/zenodo.31780');
    expect(results[0]?.resolver).toBe('datacite');
  });

  it('asks for manual entry for a web page rather than failing', async () => {
    // Reading a page needs a server; the caller turns this into a prefilled
    // form, which is a better answer than an error.
    mockUpstreams([]);
    await expect(lookupDirect('https://example.com/article')).rejects.toBeInstanceOf(
      UrlLookupUnavailable,
    );
  });

  it('carries the address on that error so nothing has to be retyped', async () => {
    mockUpstreams([]);
    await lookupDirect('example.com/a').catch((error: UrlLookupUnavailable) => {
      expect(error.url).toBe('https://example.com/a');
    });
    expect.assertions(1);
  });

  it('says it is offline rather than claiming the DOI does not exist', async () => {
    mockUpstreams([], { offline: true });
    await expect(lookupDirect('10.1038/nature12373')).rejects.toBeInstanceOf(LookupOffline);
  });

  it('reports a genuine miss as a miss', async () => {
    mockUpstreams([]);
    const response = await lookupDirect('10.9999/does-not-exist');

    expect(response.results).toEqual([]);
    expect(response.message).toMatch(/No record was found/);
  });
});
