import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup, resolveDOI, resolveISBN } from '../api/_lib/resolvers';

/**
 * Routing tests. Upstreams are stubbed by URL so the order resolvers are tried
 * in — which is the actual design decision — is what gets checked.
 */
function mockUpstreams(routes: Array<[RegExp, unknown | null]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
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

const CROSSREF_HIT = {
  message: {
    DOI: '10.1038/nature12373',
    type: 'journal-article',
    title: ['A paper'],
    'container-title': ['Nature'],
    author: [{ given: 'G.', family: 'Kucsko' }],
    issued: { 'date-parts': [[2013, 7, 31]] },
  },
};

const DATACITE_HIT = {
  data: {
    attributes: {
      doi: '10.5281/zenodo.31780',
      titles: [{ title: 'A dataset' }],
      creators: [{ name: 'Bilder, Geoffrey', nameType: 'Personal', familyName: 'Bilder', givenName: 'Geoffrey' }],
      publisher: 'Zenodo',
      publicationYear: 2015,
      types: { citeproc: 'dataset' },
    },
  },
};

const OPENLIBRARY_HIT = {
  'ISBN:9780226025988': {
    title: 'The Human Condition',
    authors: [{ name: 'Hannah Arendt' }],
    publishers: [{ name: 'University of Chicago Press' }],
    publish_date: '1998',
  },
};

const GOOGLE_HIT = {
  items: [{ volumeInfo: { title: 'A fallback book', authors: ['Someone Else'], publishedDate: '2001' } }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DOI routing', () => {
  it('uses Crossref and does not trouble DataCite when it answers', async () => {
    const calls = mockUpstreams([[/api\.crossref\.org/, CROSSREF_HIT]]);
    const results = await resolveDOI('10.1038/nature12373');

    expect(results[0]?.resolver).toBe('crossref');
    expect(results[0]?.csl.type).toBe('article-journal');
    expect(calls.some((u) => u.includes('datacite'))).toBe(false);
  });

  it('falls back to DataCite for a DOI Crossref does not hold', async () => {
    // Datasets, preprints and theses are registered with DataCite, not
    // Crossref — without this fallback every Zenodo DOI would fail.
    mockUpstreams([
      [/api\.crossref\.org/, null],
      [/api\.datacite\.org/, DATACITE_HIT],
    ]);
    const results = await resolveDOI('10.5281/zenodo.31780');

    expect(results[0]?.resolver).toBe('datacite');
    expect(results[0]?.csl.type).toBe('dataset');
  });

  it('returns nothing when neither registry knows the DOI', async () => {
    mockUpstreams([]);
    expect(await resolveDOI('10.9999/nope')).toEqual([]);
  });
});

describe('ISBN routing', () => {
  it('uses Open Library first', async () => {
    // Primary because it needs no key and imposes no shared quota; an
    // unauthenticated Google Books request starts returning 429.
    const calls = mockUpstreams([[/openlibrary\.org/, OPENLIBRARY_HIT]]);
    const results = await resolveISBN('9780226025988');

    expect(results[0]?.resolver).toBe('openlibrary');
    expect(calls.some((u) => u.includes('googleapis'))).toBe(false);
  });

  it('falls back to Google Books when Open Library has no record', async () => {
    mockUpstreams([
      [/openlibrary\.org/, {}],
      [/googleapis\.com/, GOOGLE_HIT],
    ]);
    const results = await resolveISBN('9780226025988');

    expect(results[0]?.resolver).toBe('google-books');
    expect(results[0]?.csl.title).toBe('A fallback book');
  });
});

describe('lookup dispatch', () => {
  it('sends a DOI to the registries', async () => {
    mockUpstreams([[/api\.crossref\.org\/works/, CROSSREF_HIT]]);
    const response = await lookup('https://doi.org/10.1038/nature12373');
    expect(response.results[0]?.resolver).toBe('crossref');
  });

  it('resolves an arXiv id through its minted DOI', async () => {
    // arXiv issues 10.48550/arXiv.* for every paper, so it needs no parser of
    // its own.
    const calls = mockUpstreams([[/api\.crossref\.org\/works/, CROSSREF_HIT]]);
    const response = await lookup('arXiv:2103.00020');

    expect(calls[0]).toContain(encodeURIComponent('10.48550/arXiv.2103.00020'));
    expect(response.results[0]?.key).toBe('arxiv:2103.00020');
  });

  it('sends an ISBN to the book catalogues', async () => {
    mockUpstreams([[/openlibrary\.org/, OPENLIBRARY_HIT]]);
    const response = await lookup('978-0-226-02598-8');
    expect(response.results[0]?.csl.title).toBe('The Human Condition');
  });

  it('searches Crossref when the input is a title rather than an identifier', async () => {
    const calls = mockUpstreams([
      [/api\.crossref\.org\/works\?/, { message: { items: [CROSSREF_HIT.message] } }],
    ]);
    const response = await lookup('nanometre scale thermometry');

    expect(calls[0]).toContain('query.bibliographic');
    // A search match is a guess and is scored as one.
    expect(response.results[0]?.confidence).toBeLessThan(0.7);
  });

  it('explains an empty result instead of returning a bare failure', async () => {
    mockUpstreams([]);
    const response = await lookup('10.9999/does-not-exist');

    expect(response.results).toEqual([]);
    expect(response.message).toMatch(/No record was found for that DOI/);
  });

  it('says so plainly when the input is not citable at all', async () => {
    mockUpstreams([]);
    const response = await lookup('!!');
    expect(response.message).toMatch(/does not look like a URL, DOI or ISBN/);
  });
});
