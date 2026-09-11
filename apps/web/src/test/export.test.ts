import { describe, expect, it } from 'vitest';
import type { CSLItem } from '@opencite/shared';
import { citeKeyFor, toBibTeX } from '@/export/bibtex';
import { toRIS } from '@/export/ris';
import { toHTMLDocument } from '@/export/html';
import { parseEntry, runsFrom } from '@/export/docx';
import { safeFilename } from '@/export/download';
import { toCSLJSON } from '@/export/formats';

const ARTICLE: CSLItem = {
  id: '1',
  type: 'article-journal',
  title: 'DNA methylation in Arabidopsis',
  'container-title': 'Nature',
  author: [
    { family: 'Kucsko', given: 'G.' },
    { family: 'Maurer', given: 'P. C.' },
  ],
  volume: '500',
  issue: '7460',
  page: '54-58',
  DOI: '10.1038/nature12373',
  ISSN: '0028-0836',
  issued: { 'date-parts': [[2013, 7, 31]] },
};

const BOOK: CSLItem = {
  id: '2',
  type: 'book',
  title: 'The Human Condition',
  author: [{ family: 'Arendt', given: 'Hannah' }],
  publisher: 'University of Chicago Press',
  'publisher-place': 'Chicago',
  ISBN: '9780226025988',
  issued: { 'date-parts': [[1958]] },
};

describe('BibTeX', () => {
  it('maps CSL types onto BibTeX entry types', () => {
    expect(toBibTeX([ARTICLE])).toContain('@article{');
    expect(toBibTeX([BOOK])).toContain('@book{');
    expect(toBibTeX([{ ...BOOK, type: 'chapter' }])).toContain('@incollection{');
    expect(toBibTeX([{ ...BOOK, type: 'webpage' }])).toContain('@misc{');
  });

  it('braces the title so BibTeX cannot re-case it', () => {
    // Unbraced, a BibTeX style renders this as "Dna methylation in arabidopsis".
    expect(toBibTeX([ARTICLE])).toContain('title = {{DNA methylation in Arabidopsis}}');
  });

  it('writes page ranges with an en-dash', () => {
    expect(toBibTeX([ARTICLE])).toContain('pages = {54--58}');
  });

  it('uses journal for articles and booktitle for chapters', () => {
    expect(toBibTeX([ARTICLE])).toContain('journal = {Nature}');
    expect(toBibTeX([{ ...ARTICLE, type: 'chapter' }])).toContain('booktitle = {Nature}');
  });

  it('formats names as "Family, Given" joined by and', () => {
    expect(toBibTeX([ARTICLE])).toContain('author = {Kucsko, G. and Maurer, P. C.}');
  });

  it('braces an organisation so it is not parsed as a person', () => {
    const csl: CSLItem = { ...BOOK, author: [{ literal: 'World Health Organization' }] };
    expect(toBibTeX([csl])).toContain('author = {{World Health Organization}}');
  });

  it('escapes the characters BibTeX reads as markup', () => {
    const csl: CSLItem = { ...BOOK, title: 'Cost & Effect: 50% of #1', publisher: 'A_B' };
    const out = toBibTeX([csl]);
    expect(out).toContain('\\&');
    expect(out).toContain('\\%');
    expect(out).toContain('\\#');
    expect(out).toContain('A\\_B');
  });

  it('builds a conventional cite key', () => {
    expect(citeKeyFor(BOOK)).toBe('arendt1958human');
    expect(citeKeyFor({ ...BOOK, issued: undefined })).toBe('arendtndhuman');
  });

  it('makes colliding cite keys unique', () => {
    // Two identical keys would leave LaTeX silently using only one of them.
    const out = toBibTeX([BOOK, { ...BOOK, id: '3' }, { ...BOOK, id: '4' }]);
    expect(out).toContain('@book{arendt1958human,');
    expect(out).toContain('@book{arendt1958humana,');
    expect(out).toContain('@book{arendt1958humanb,');
  });

  it('strips accents from cite keys but not from field values', () => {
    const csl: CSLItem = { ...BOOK, author: [{ family: 'Peña', given: 'José' }] };
    expect(citeKeyFor(csl)).toBe('pena1958human');
    expect(toBibTeX([csl])).toContain('Peña, José');
  });

  it('emits nothing for an empty library', () => {
    expect(toBibTeX([])).toBe('');
  });
});

describe('RIS', () => {
  it('opens with TY and closes with ER', () => {
    const lines = toRIS([ARTICLE]).split('\r\n');
    expect(lines[0]).toBe('TY  - JOUR');
    expect(lines.filter(Boolean).at(-1)).toBe('ER  - ');
  });

  it('uses CRLF, which strict readers require', () => {
    expect(toRIS([ARTICLE])).toContain('\r\n');
  });

  it('splits a page range into SP and EP', () => {
    const out = toRIS([ARTICLE]);
    expect(out).toContain('SP  - 54');
    expect(out).toContain('EP  - 58');
  });

  it('writes one AU line per author, family-first', () => {
    const out = toRIS([ARTICLE]);
    expect(out).toContain('AU  - Kucsko,G.');
    expect(out).toContain('AU  - Maurer,P. C.');
  });

  it('maps types to the RIS vocabulary', () => {
    expect(toRIS([BOOK])).toContain('TY  - BOOK');
    expect(toRIS([{ ...BOOK, type: 'webpage' }])).toContain('TY  - ELEC');
    expect(toRIS([{ ...BOOK, type: 'thesis' }])).toContain('TY  - THES');
  });

  it('flattens newlines that would otherwise look like a new tag', () => {
    const csl: CSLItem = { ...BOOK, abstract: 'First line.\nSecond line.' };
    const out = toRIS([csl]);
    expect(out).toContain('AB  - First line. Second line.');
    expect(out).not.toContain('\nSecond line.');
  });

  it('writes partial dates without trailing separators', () => {
    expect(toRIS([BOOK])).toContain('DA  - 1958');
    expect(toRIS([ARTICLE])).toContain('DA  - 2013/07/31');
  });
});

describe('docx run parsing', () => {
  it('turns italics into a formatted run', () => {
    const runs = runsFrom('Arendt, H. (1958). <i>The human condition</i>. Chicago.');
    expect(runs).toHaveLength(3);
    expect(runs[1]).toEqual({ text: 'The human condition', italic: true });
  });

  it('decodes the entities citeproc emits', () => {
    expect(runsFrom('Vaswani, A., &#38; Shazeer, N.')[0]?.text).toBe('Vaswani, A., & Shazeer, N.');
    expect(runsFrom('pp. 54&#8211;58')[0]?.text).toBe('pp. 54–58');
  });

  it('merges adjacent runs with the same formatting', () => {
    // Otherwise a Word file gets a run boundary every few characters.
    expect(runsFrom('one <span>two</span> three')).toHaveLength(1);
  });

  it('splits a numeric entry into its label and its text', () => {
    const entry = parseEntry(
      '<div class="csl-entry"><div class="csl-left-margin">[1]</div><div class="csl-right-inline">H. Arendt, <i>The Human Condition</i>.</div></div>',
    );
    expect(entry.label?.[0]?.text).toBe('[1]');
    expect(entry.body?.at(-1)?.text).toBe('.');
    expect(entry.body.some((r) => r.italic)).toBe(true);
  });

  it('treats an author-date entry as body only', () => {
    const entry = parseEntry('<div class="csl-entry">Arendt, H. (1958).</div>');
    expect(entry.label).toBeUndefined();
    expect(entry.body[0]?.text).toContain('Arendt');
  });

  it('degrades unknown tags to plain text rather than failing', () => {
    expect(runsFrom('a <weird attr="x">b</weird> c')[0]?.text).toBe('a b c');
  });
});

describe('HTML document', () => {
  it('inlines its styles so the file works offline', () => {
    const html = toHTMLDocument(['<div class="csl-entry">Arendt, H.</div>'], { title: 'My list' });
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
    expect(html).toContain('My list');
  });

  it('follows the style for indentation, as on screen', () => {
    const hanging = toHTMLDocument([], {
      layout: { hangingIndent: true, secondFieldAlign: false, maxOffset: 0, entrySpacing: 0, lineSpacing: 1 },
    });
    expect(hanging).toContain('text-indent: -2em');

    const numeric = toHTMLDocument([], {
      layout: { hangingIndent: false, secondFieldAlign: 'flush', maxOffset: 3, entrySpacing: 0, lineSpacing: 1 },
    });
    expect(numeric).toContain('flex: 0 0 3ch');
    expect(numeric).not.toContain('text-indent: -2em');
  });

  it('escapes a title that contains markup', () => {
    expect(toHTMLDocument([], { title: '<script>x</script>' })).not.toContain('<script>');
  });
});

describe('CSL JSON', () => {
  it('exports the stored payload unchanged', () => {
    const parsed = JSON.parse(toCSLJSON([ARTICLE])) as CSLItem[];
    expect(parsed[0]).toEqual(ARTICLE);
  });
});

describe('filenames', () => {
  it('makes a project name safe for a filesystem', () => {
    expect(safeFilename('My Thesis: Chapter 1/2', 'bib')).toBe('My-Thesis-Chapter-12.bib');
    expect(safeFilename('  ', 'ris')).toBe('bibliography.ris');
    expect(safeFilename('Café Notes', 'txt')).toBe('Cafe-Notes.txt');
  });
});
