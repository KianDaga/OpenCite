import { describe, expect, it } from 'vitest';
import { crossrefToCSL } from '../api/_lib/resolvers/crossref';
import { dataciteToCSL } from '../api/_lib/resolvers/datacite';
import { openLibraryToCSL } from '../api/_lib/resolvers/openLibrary';
import { googleBooksToCSL } from '../api/_lib/resolvers/googleBooks';

/**
 * Fixtures are trimmed copies of real responses, captured from the live APIs
 * rather than written from memory — the field shapes are the whole point.
 */

const CROSSREF_WORK = {
  DOI: '10.1038/nature12373',
  type: 'journal-article',
  title: ['Nanometre-scale thermometry in a living cell'],
  'container-title': ['Nature'],
  author: [
    { given: 'G.', family: 'Kucsko', sequence: 'first', affiliation: [] },
    { given: 'P. C.', family: 'Maurer', sequence: 'additional', affiliation: [] },
    { name: 'The Nature Collaboration' },
  ],
  publisher: 'Springer Science and Business Media LLC',
  volume: '500',
  issue: '7460',
  page: '54-58',
  ISSN: ['0028-0836', '1476-4687'],
  issued: { 'date-parts': [[2013, 7, 31]] },
  abstract: '<jats:p>We report a technique.</jats:p>',
};

describe('Crossref mapping', () => {
  it('maps Crossref types onto the CSL vocabulary', () => {
    // Crossref says "journal-article"; CSL says "article-journal". Passing
    // Crossref's word through unchanged produces a style that matches nothing.
    expect(crossrefToCSL(CROSSREF_WORK, 'x').type).toBe('article-journal');
    expect(crossrefToCSL({ ...CROSSREF_WORK, type: 'book-chapter' }, 'x').type).toBe('chapter');
    expect(crossrefToCSL({ ...CROSSREF_WORK, type: 'posted-content' }, 'x').type).toBe('article');
    expect(crossrefToCSL({ ...CROSSREF_WORK, type: 'wat' }, 'x').type).toBe('document');
  });

  it('unwraps the single-element arrays Crossref wraps things in', () => {
    const csl = crossrefToCSL(CROSSREF_WORK, 'x');
    expect(csl.title).toBe('Nanometre-scale thermometry in a living cell');
    expect(csl['container-title']).toBe('Nature');
    expect(csl.ISSN).toBe('0028-0836');
  });

  it('joins a split subtitle back onto the title', () => {
    const csl = crossrefToCSL({ ...CROSSREF_WORK, subtitle: ['a second look'] }, 'x');
    expect(csl.title).toBe('Nanometre-scale thermometry in a living cell: a second look');
  });

  it('keeps institutional authors whole', () => {
    const csl = crossrefToCSL(CROSSREF_WORK, 'x');
    expect(csl.author?.[2]).toEqual({ literal: 'The Nature Collaboration' });
  });

  it('drops Crossref bookkeeping from author entries', () => {
    // `sequence` and `affiliation` are not CSL and have no place in a
    // bibliography payload.
    expect(csl_author_keys()).toEqual(['family', 'given']);
    function csl_author_keys() {
      return Object.keys(crossrefToCSL(CROSSREF_WORK, 'x').author![0]!).sort();
    }
  });

  it('flattens the JATS abstract to plain text', () => {
    expect(crossrefToCSL(CROSSREF_WORK, 'x').abstract).toBe('We report a technique.');
  });

  it('falls back through the published-* dates when issued is absent', () => {
    const { issued, ...rest } = CROSSREF_WORK;
    const csl = crossrefToCSL(
      { ...rest, 'published-print': { 'date-parts': [[2013, 8]] } },
      'x',
    );
    expect(csl.issued).toEqual({ 'date-parts': [[2013, 8]] });
  });

  it('omits empty fields rather than emitting blanks', () => {
    const csl = crossrefToCSL({ DOI: '10.1/x', type: 'journal-article', title: ['T'] }, 'x');
    expect(csl.editor).toBeUndefined();
    expect(csl.volume).toBeUndefined();
  });
});

describe('DataCite mapping', () => {
  const ATTRIBUTES = {
    doi: '10.5281/zenodo.31780',
    titles: [{ title: 'Doi Myths... Busted' }],
    creators: [
      { name: 'Bilder, Geoffrey', nameType: 'Personal' as const, givenName: 'Geoffrey', familyName: 'Bilder' },
      { name: 'CERN', nameType: 'Organizational' as const },
    ],
    publisher: 'Zenodo',
    publicationYear: 2015,
    types: { citeproc: 'article-journal' },
    url: 'https://zenodo.org/record/31780',
  };

  it('uses DataCite s own CSL type mapping', () => {
    // Unlike Crossref, DataCite publishes types.citeproc — no guessing needed.
    expect(dataciteToCSL(ATTRIBUTES, 'x').type).toBe('article-journal');
  });

  it('respects the declared personal/organisational distinction', () => {
    const csl = dataciteToCSL(ATTRIBUTES, 'x');
    expect(csl.author?.[0]).toEqual({ family: 'Bilder', given: 'Geoffrey' });
    expect(csl.author?.[1]).toEqual({ literal: 'CERN' });
  });

  it('defaults to a dataset when no type is given', () => {
    const { types, ...rest } = ATTRIBUTES;
    expect(dataciteToCSL(rest, 'x').type).toBe('dataset');
  });
});

describe('Open Library mapping', () => {
  const BOOK = {
    title: 'The Human Condition',
    authors: [{ name: 'Hannah Arendt' }],
    publishers: [{ name: 'University of Chicago Press' }],
    publish_places: [{ name: 'Chicago' }],
    publish_date: '1998',
    number_of_pages: 349,
    url: 'http://openlibrary.org/books/OL357130M/The_Human_Condition',
  };

  it('splits the single-string author name', () => {
    expect(openLibraryToCSL(BOOK, '9780226025988', 'x').author?.[0]).toEqual({
      family: 'Arendt',
      given: 'Hannah',
    });
  });

  it('keeps a bare year as a bare year', () => {
    expect(openLibraryToCSL(BOOK, '9780226025988', 'x').issued).toEqual({
      'date-parts': [[1998]],
    });
  });

  it('reads a written-out publication date', () => {
    const csl = openLibraryToCSL({ ...BOOK, publish_date: 'March 1998' }, '978', 'x');
    expect(csl.issued).toEqual({ 'date-parts': [[1998, 3]] });
  });

  it('joins the subtitle onto the title', () => {
    const csl = openLibraryToCSL({ ...BOOK, subtitle: 'Second Edition' }, '978', 'x');
    expect(csl.title).toBe('The Human Condition: Second Edition');
  });
});

describe('Google Books mapping', () => {
  const INFO = {
    title: 'The Human Condition',
    authors: ['Hannah Arendt', 'Margaret Canovan'],
    publisher: 'University of Chicago Press',
    publishedDate: '2013-05-07',
    pageCount: 416,
    language: 'en',
    industryIdentifiers: [
      { type: 'ISBN_10', identifier: '0226924572' },
      { type: 'ISBN_13', identifier: '9780226924571' },
    ],
  };

  it('prefers the ISBN-13 the catalogue reports', () => {
    expect(googleBooksToCSL(INFO, '0226924572', 'x').ISBN).toBe('9780226924571');
  });

  it('parses every author and the full date', () => {
    const csl = googleBooksToCSL(INFO, '978', 'x');
    expect(csl.author).toHaveLength(2);
    expect(csl.issued).toEqual({ 'date-parts': [[2013, 5, 7]] });
  });
});
