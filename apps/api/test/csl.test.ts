import { describe, expect, it } from 'vitest';
import { parseDate, parseName, parseNames, stripMarkup } from '../api/_lib/csl';

describe('parseName', () => {
  it('reads "Family, Given"', () => {
    expect(parseName('Arendt, Hannah')).toEqual({ family: 'Arendt', given: 'Hannah' });
  });

  it('reads "Given Family"', () => {
    expect(parseName('Hannah Arendt')).toEqual({ family: 'Arendt', given: 'Hannah' });
  });

  it('keeps middle names with the given name', () => {
    expect(parseName('Jane Q. Public')).toEqual({ family: 'Public', given: 'Jane Q.' });
  });

  it('splits a suffix into its own field', () => {
    expect(parseName('Martin Luther King Jr.')).toEqual({
      family: 'King',
      given: 'Martin Luther',
      suffix: 'Jr.',
    });
  });

  it('keeps an organisation whole', () => {
    // Split into family/given, styles would initialise this into nonsense
    // like "Organization, W. H."
    expect(parseName('World Health Organization')).toEqual({
      literal: 'World Health Organization',
    });
    expect(parseName('University of Chicago Press')).toEqual({
      literal: 'University of Chicago Press',
    });
  });

  it('splits a list of authors on semicolons', () => {
    expect(parseNames('Arendt, Hannah; Vaswani, Ashish')).toHaveLength(2);
  });
});

describe('parseDate', () => {
  it('keeps the precision it was given', () => {
    // Inventing a January would put a date in the citation that is not true.
    expect(parseDate('1998')).toEqual({ 'date-parts': [[1998]] });
    expect(parseDate('1998-03')).toEqual({ 'date-parts': [[1998, 3]] });
    expect(parseDate('1998-03-12')).toEqual({ 'date-parts': [[1998, 3, 12]] });
  });

  it('reads ISO timestamps', () => {
    expect(parseDate('2021-04-05T10:00:00Z')).toEqual({ 'date-parts': [[2021, 4, 5]] });
  });

  it('reads month names in either order', () => {
    expect(parseDate('March 1998')).toEqual({ 'date-parts': [[1998, 3]] });
    expect(parseDate('12 March 1998')).toEqual({ 'date-parts': [[1998, 3, 12]] });
    expect(parseDate('March 12, 1998')).toEqual({ 'date-parts': [[1998, 3, 12]] });
  });

  it('falls back to a year found anywhere', () => {
    expect(parseDate('first published in 1958 by Chicago')).toEqual({
      'date-parts': [[1958]],
    });
  });

  it('keeps an unparseable date verbatim rather than guessing', () => {
    expect(parseDate('forthcoming')).toEqual({ literal: 'forthcoming' });
  });

  it('returns nothing for nothing', () => {
    expect(parseDate(undefined)).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
  });
});

describe('stripMarkup', () => {
  it('flattens a JATS abstract to plain text', () => {
    expect(stripMarkup('<jats:p>Hello <jats:italic>world</jats:italic> &amp; all</jats:p>')).toBe(
      'Hello world & all',
    );
  });
});
