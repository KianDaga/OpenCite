import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Vite's `?raw` loads the fixture as a string, the same way the app would load
// a vendored style — and unlike `node:fs`, it resolves under jsdom.
import AUTHOR_DATE from './fixtures/test-author-date.csl?raw';
import NUMERIC from './fixtures/test-numeric.csl?raw';
import DEPENDENT from './fixtures/test-dependent.csl?raw';
import LOCALE from './fixtures/locales-en-US.xml?raw';
import { db } from '@/db/dexieStore';
import { formatNameForDisplay } from '@/lib/derive';
import {
  CSLFetchError,
  clearEngineCache,
  clearStyleMemoryCache,
  parseStyleInfo,
  preloadLocales,
  renderBibliography,
  renderCitation,
  renderCitations,
  resolveStyle,
  toPlainText,
} from '@/citation';

/**
 * Serves fixtures by matching the *end of the URL path*, not just the
 * filename — so a style only answers on the path it really lives at, and the
 * registry's candidate order (self-hosted, then CDN root, then `dependent/`)
 * is genuinely exercised rather than short-circuited by the mock.
 */
function mockNetwork(files: Record<string, string>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url);
    const match = Object.entries(files).find(([path]) => url.endsWith(path));
    if (!match) return { ok: false, status: 404, text: async () => 'Not found' };
    return { ok: true, status: 200, text: async () => match[1] };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const ITEMS = [
  {
    id: 'a',
    type: 'book' as const,
    title: 'The human condition',
    author: [{ family: 'Arendt', given: 'Hannah' }],
    issued: { 'date-parts': [[1958]] as [number][] },
  },
  {
    id: 'b',
    type: 'article-journal' as const,
    title: 'Attention is all you need',
    author: [{ family: 'Vaswani', given: 'Ashish' }],
    issued: { 'date-parts': [[2017]] as [number][] },
  },
];

/**
 * Paths mirror the real repository layout: independent styles at the root,
 * dependent ones under `dependent/`. Nothing is served from `/csl/`, so every
 * lookup also proves the self-hosted candidate falls through cleanly.
 */
const DEFAULT_FILES = {
  'styles@master/test-author-date.csl': AUTHOR_DATE,
  'styles@master/test-numeric.csl': NUMERIC,
  'styles@master/dependent/test-dependent.csl': DEPENDENT,
  'locales@master/locales-en-US.xml': LOCALE,
};

beforeEach(async () => {
  await db.open();
  await db.styles.clear();
  clearStyleMemoryCache();
  clearEngineCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseStyleInfo', () => {
  it('reads the title, parent link and default locale', () => {
    const info = parseStyleInfo(DEPENDENT, 'test-dependent');
    expect(info.title).toBe('Test Dependent Journal');
    expect(info.parentId).toBe('test-author-date');
    expect(info.defaultLocale).toBe('en-US');
    expect(info.categoryFormat).toBe('author-date');
  });

  it('leaves parentId unset for an independent style', () => {
    expect(parseStyleInfo(AUTHOR_DATE, 'test-author-date').parentId).toBeUndefined();
  });
});

describe('style registry', () => {
  it('follows a dependent style to its parent but keeps the requested identity', async () => {
    mockNetwork(DEFAULT_FILES);

    const resolved = await resolveStyle('test-dependent');

    expect(resolved.requestedId).toBe('test-dependent');
    expect(resolved.effectiveId).toBe('test-author-date');
    // The user picked the journal, so that is the name to keep showing.
    expect(resolved.title).toBe('Test Dependent Journal');
    // …but the rules that run are the parent's.
    expect(resolved.xml).toContain('hanging-indent="true"');
  });

  it('falls back through the candidate paths to find a dependent style', async () => {
    const { calls } = mockNetwork(DEFAULT_FILES);
    const resolved = await resolveStyle('test-dependent');

    // Self-hosted first, then the CDN root, then dependent/ — and only the
    // last one actually holds this style.
    expect(calls[0]).toContain('/csl/styles/test-dependent.csl');
    expect(calls.some((url) => url.endsWith('/dependent/test-dependent.csl'))).toBe(true);
    expect(resolved.effectiveId).toBe('test-author-date');
  });

  it('serves a second request from cache without another fetch', async () => {
    const { fetchMock } = mockNetwork(DEFAULT_FILES);

    await resolveStyle('test-author-date');
    const afterFirst = fetchMock.mock.calls.length;
    clearStyleMemoryCache(); // force it through IndexedDB, not just the Map
    await resolveStyle('test-author-date');

    expect(fetchMock.mock.calls.length).toBe(afterFirst);
    expect(await db.styles.get('test-author-date')).toBeDefined();
  });

  it('reports a style it cannot find anywhere', async () => {
    mockNetwork(DEFAULT_FILES);
    await expect(resolveStyle('no-such-style')).rejects.toBeInstanceOf(CSLFetchError);
  });

  it('always preloads en-US, whatever else was asked for', async () => {
    mockNetwork(DEFAULT_FILES);
    const locales = await preloadLocales(['en-US']);
    expect(locales.has('en-US')).toBe(true);
  });

  it('survives a missing regional locale by keeping the fallback', async () => {
    mockNetwork(DEFAULT_FILES); // de-DE is absent from the fixtures
    const locales = await preloadLocales(['de-DE']);

    expect(locales.has('de-DE')).toBe(false);
    expect(locales.has('en-US')).toBe(true);
  });
});

describe('rendering', () => {
  it('formats an author-date bibliography with a hanging indent', async () => {
    mockNetwork(DEFAULT_FILES);
    const result = await renderBibliography(ITEMS, 'test-author-date', 'en-US');

    expect(result.layout.hangingIndent).toBe(true);
    expect(result.layout.secondFieldAlign).toBe(false);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toContain('Arendt, Hannah (1958)');
    expect(result.ids).toEqual(['a', 'b']);
  });

  it('formats a numeric bibliography into a label gutter instead', async () => {
    mockNetwork(DEFAULT_FILES);
    const result = await renderBibliography(ITEMS, 'test-numeric', 'en-US');

    // The regression this guards: hard-coding a hanging indent in CSS breaks
    // every numeric style, silently and only visually.
    expect(result.layout.hangingIndent).toBe(false);
    expect(result.layout.secondFieldAlign).toBe('flush');
    expect(result.layout.maxOffset).toBeGreaterThan(0);
    expect(result.entries[0]).toContain('csl-left-margin');
  });

  it('orders entries by the style, not by the order given', async () => {
    mockNetwork(DEFAULT_FILES);
    // Vaswani passed first, but the style sorts alphabetically by author.
    const result = await renderBibliography([ITEMS[1]!, ITEMS[0]!], 'test-author-date', 'en-US');
    expect(result.ids).toEqual(['a', 'b']);
  });

  it('renders a dependent style using its parent rules', async () => {
    mockNetwork(DEFAULT_FILES);
    const result = await renderBibliography(ITEMS, 'test-dependent', 'en-US');

    expect(result.layout.hangingIndent).toBe(true);
    expect(result.styleTitle).toBe('Test Dependent Journal');
  });

  it('renders in-text citations in the style s own form', async () => {
    mockNetwork(DEFAULT_FILES);

    expect(await renderCitation(ITEMS[1]!, 'test-author-date', 'en-US')).toBe('(Vaswani, 2017)');
    expect(await renderCitation(ITEMS[1]!, 'test-numeric', 'en-US')).toBe('[1]');
  });

  it('returns an empty bibliography rather than throwing on no references', async () => {
    mockNetwork(DEFAULT_FILES);
    const result = await renderBibliography([], 'test-author-date', 'en-US');

    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('reuses one engine across renders of the same style', async () => {
    const { fetchMock } = mockNetwork(DEFAULT_FILES);

    await renderBibliography(ITEMS, 'test-author-date', 'en-US');
    const afterFirst = fetchMock.mock.calls.length;
    await renderBibliography([ITEMS[0]!], 'test-author-date', 'en-US');

    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it('strips markup and entities for plain-text copy', () => {
    expect(toPlainText('<div class="csl-entry">Vaswani, A., &#38; Shazeer, N. <i>Title</i>.</div>')).toBe(
      'Vaswani, A., & Shazeer, N. Title.',
    );
  });
});

describe('response validation', () => {
  it('rejects an SPA fallback page masquerading as a style', async () => {
    // Static hosting answers any unmatched path with index.html and HTTP 200,
    // so the self-hosted candidate "succeeds" with the app's own HTML. Without
    // a content check that reaches citeproc and fails deep in its parser.
    const { calls } = mockNetwork({
      '/csl/styles/test-author-date.csl': '<!doctype html><html><body>OpenCite</body></html>',
      'styles@master/test-author-date.csl': AUTHOR_DATE,
      'locales@master/locales-en-US.xml': LOCALE,
    });

    const resolved = await resolveStyle('test-author-date');

    expect(calls[0]).toContain('/csl/styles/');
    expect(resolved.xml).toContain('hanging-indent="true"');
    expect(resolved.xml).not.toContain('doctype html');
  });

  it('rejects a stray HTML page served in place of a locale', async () => {
    mockNetwork({
      '/csl/locales/locales-en-US.xml': '<!doctype html><html><body>nope</body></html>',
      'locales@master/locales-en-US.xml': LOCALE,
    });

    const locales = await preloadLocales(['en-US']);
    expect(locales.get('en-US')).toContain('<locale');
  });
});

describe('list labels', () => {
  it('numbers every reference, not just the first', async () => {
    // Rendered one at a time, a numeric style calls each reference "[1]",
    // because citeproc numbers from whatever is registered at the time.
    mockNetwork(DEFAULT_FILES);
    const labels = await renderCitations(ITEMS, 'test-numeric', 'en-US');

    expect(labels.get('a')).toBe('[1]');
    expect(labels.get('b')).toBe('[2]');
  });

  it('labels author-date styles per reference', async () => {
    mockNetwork(DEFAULT_FILES);
    const labels = await renderCitations(ITEMS, 'test-author-date', 'en-US');

    expect(labels.get('a')).toBe('(Arendt, 1958)');
    expect(labels.get('b')).toBe('(Vaswani, 2017)');
  });

  it('returns nothing for an empty list rather than starting an engine', async () => {
    mockNetwork(DEFAULT_FILES);
    expect((await renderCitations([], 'test-numeric', 'en-US')).size).toBe(0);
  });
});

describe('display names', () => {
  it('reads in natural order, not index order', () => {
    // The search index stores "Arendt Hannah" so either half matches; showing
    // that to a reader is simply the name backwards.
    expect(formatNameForDisplay({ family: 'Arendt', given: 'Hannah' })).toBe('Hannah Arendt');
    expect(formatNameForDisplay({ family: 'Kuhn', given: 'Thomas S.' })).toBe('Thomas S. Kuhn');
  });

  it('keeps particles with the family name and suffixes last', () => {
    expect(
      formatNameForDisplay({ family: 'Beethoven', given: 'Ludwig', 'non-dropping-particle': 'van' }),
    ).toBe('Ludwig van Beethoven');
    expect(formatNameForDisplay({ family: 'King', given: 'Martin Luther', suffix: 'Jr.' })).toBe(
      'Martin Luther King Jr.',
    );
  });

  it('passes an organisation through untouched', () => {
    expect(formatNameForDisplay({ literal: 'World Health Organization' })).toBe(
      'World Health Organization',
    );
  });
});
