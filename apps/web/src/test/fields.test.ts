import { describe, expect, it } from 'vitest';
import { dateToInput, inputToDate } from '@/components/dialogs/fields';
import { COMMON_TYPES, fieldsForType, typeLabel } from '@/lib/cslFields';

describe('manual date entry', () => {
  it('keeps whatever precision was typed', () => {
    // A year alone must stay a year: filling in 1 January would put a date in
    // the citation that the source never claimed.
    expect(inputToDate('2019')).toEqual({ 'date-parts': [[2019]] });
    expect(inputToDate('2019-03')).toEqual({ 'date-parts': [[2019, 3]] });
    expect(inputToDate('2019-03-12')).toEqual({ 'date-parts': [[2019, 3, 12]] });
  });

  it('round-trips through the input and back', () => {
    for (const text of ['2019', '2019-03', '2019-03-12']) {
      expect(dateToInput(inputToDate(text))).toBe(text);
    }
  });

  it('pads months and days so the field reads consistently', () => {
    expect(dateToInput({ 'date-parts': [[2019, 3, 2]] })).toBe('2019-03-02');
  });

  it('keeps something unparseable verbatim instead of discarding it', () => {
    expect(inputToDate('forthcoming')).toEqual({ literal: 'forthcoming' });
    expect(dateToInput({ literal: 'n.d.' })).toBe('n.d.');
  });

  it('treats an empty field as no date at all', () => {
    expect(inputToDate('')).toBeUndefined();
    expect(inputToDate('   ')).toBeUndefined();
    expect(dateToInput(undefined)).toBe('');
  });
});

describe('field sets', () => {
  it('shows the fields each type actually needs', () => {
    const journal = fieldsForType('article-journal').map((f) => f.name);
    expect(journal).toContain('volume');
    expect(journal).toContain('issue');
    expect(journal).toContain('DOI');

    // A book has no issue number, and offering one invites a wrong citation.
    const book = fieldsForType('book').map((f) => f.name);
    expect(book).toContain('ISBN');
    expect(book).toContain('publisher');
    expect(book).not.toContain('issue');

    const webpage = fieldsForType('webpage').map((f) => f.name);
    expect(webpage).toContain('accessed');
    expect(webpage).toContain('URL');
  });

  it('always asks for a title', () => {
    for (const type of COMMON_TYPES) {
      expect(fieldsForType(type.value).map((f) => f.name), type.value).toContain('title');
    }
  });

  it('falls back to a sensible set for an unusual type', () => {
    expect(fieldsForType('musical_score').map((f) => f.name)).toContain('title');
  });

  it('names types in words rather than CSL identifiers', () => {
    expect(typeLabel('article-journal')).toBe('Journal article');
    expect(typeLabel('motion_picture')).toBe('Film or video');
    // Unknown types degrade to something readable, not raw punctuation.
    expect(typeLabel('musical_score')).toBe('musical score');
  });
});
