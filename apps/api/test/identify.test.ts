import { describe, expect, it } from 'vitest';
import { identify, isValidISBN, normalizeDOI, normalizeURL } from '@opencite/shared';

describe('identify', () => {
  it('finds a DOI however it was pasted', () => {
    for (const input of [
      '10.1038/nature12373',
      'doi:10.1038/nature12373',
      'https://doi.org/10.1038/nature12373',
      'http://dx.doi.org/10.1038/nature12373',
      'see https://doi.org/10.1038/nature12373 for details',
    ]) {
      const result = identify(input);
      expect(result.kind, input).toBe('doi');
      expect(result.value, input).toBe('10.1038/nature12373');
    }
  });

  it('lowercases the DOI cache key, since DOIs are case-insensitive', () => {
    expect(identify('10.1038/NATURE12373').key).toBe('doi:10.1038/nature12373');
  });

  it('prefers the DOI inside a publisher URL over scraping the page', () => {
    // Scraping a landing page when the registry record is one request away
    // would give worse metadata for more work.
    expect(identify('https://www.nature.com/articles/nature12373?doi=10.1038/nature12373').kind).toBe(
      'doi',
    );
  });

  it('accepts ISBNs only when the check digit agrees', () => {
    expect(identify('9780226025988').kind).toBe('isbn');
    expect(identify('978-0-226-02598-8').value).toBe('9780226025988');
    expect(identify('0226025985').kind).toBe('isbn');

    // A plausible-looking number that is not an ISBN must not become one:
    // looking it up would return a confidently wrong book.
    expect(identify('9780226025987').kind).not.toBe('isbn');
    expect(isValidISBN('1234567890123')).toBe(false);
  });

  it('recognises arXiv ids only in an arXiv context', () => {
    expect(identify('arXiv:2103.00020').kind).toBe('arxiv');
    expect(identify('https://arxiv.org/abs/2103.00020v2').value).toBe('2103.00020');
    // A bare number like this is far more likely to be something else.
    expect(identify('2103.00020').kind).not.toBe('arxiv');
  });

  it('treats anything else web-shaped as a URL', () => {
    expect(identify('https://example.com/a/b').kind).toBe('url');
    expect(identify('example.com/article').kind).toBe('url');
    expect(identify('www.bbc.co.uk/news/123').kind).toBe('url');
  });

  it('reports free text as unknown so it can be searched instead', () => {
    expect(identify('attention is all you need').kind).toBe('unknown');
  });
});

describe('normalisation', () => {
  it('strips tracking parameters so one page caches once', () => {
    expect(normalizeURL('https://example.com/a?utm_source=x&id=7&fbclid=abc')).toBe(
      'https://example.com/a?id=7',
    );
  });

  it('drops the fragment and adds a missing scheme', () => {
    expect(normalizeURL('example.com/a#section-2')).toBe('https://example.com/a');
  });

  it('trims trailing punctuation from a DOI copied out of prose', () => {
    expect(normalizeDOI('10.1038/nature12373.')).toBe('10.1038/nature12373');
  });
});
