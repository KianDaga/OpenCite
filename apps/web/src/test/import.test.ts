import { describe, expect, it } from 'vitest';
import { decodeTeX, detectFormat, parseBibTeX, parseRIS, parseReferences } from '@/import';
import { toBibTeX } from '@/export/bibtex';
import { toRIS } from '@/export/ris';
import type { CSLItem } from '@opencite/shared';

const BIB = `
@article{kucsko2013nanometre,
  author = {Kucsko, G. and Maurer, P. C. and {The Nature Collaboration}},
  title = {{Nanometre-scale thermometry in a living cell}},
  journal = {Nature},
  volume = {500},
  number = {7460},
  pages = {54--58},
  year = {2013},
  month = jul,
  doi = {10.1038/nature12373},
}

@book{pena2001dna,
  author = {Pe{\\~n}a, Jos{\\'e}},
  title = {{DNA Methylation in Cost \\& Effect}},
  publisher = {Chicago Press},
  address = {Chicago},
  year = {2001},
}
`;

const RIS = `TY  - JOUR\r
AU  - Kucsko,G.\r
AU  - Maurer,P. C.\r
TI  - Nanometre-scale thermometry in a living cell\r
T2  - Nature\r
SP  - 54\r
EP  - 58\r
VL  - 500\r
IS  - 7460\r
DO  - 10.1038/nature12373\r
SN  - 0028-0836\r
PY  - 2013\r
DA  - 2013/07/31\r
ER  - \r
\r
TY  - BOOK\r
AU  - Arendt,Hannah\r
TI  - The Human Condition\r
PB  - University of Chicago Press\r
CY  - Chicago\r
SN  - 9780226025988\r
PY  - 1958\r
ER  - \r
`;

describe('format detection', () => {
  it('recognises each format it can read', () => {
    expect(detectFormat(BIB)).toBe('bibtex');
    expect(detectFormat(RIS)).toBe('ris');
    expect(detectFormat('[{"type":"book"}]')).toBe('csl-json');
    expect(detectFormat('just some prose')).toBe('unknown');
  });
});

describe('BibTeX import', () => {
  const { skipped } = parseBibTeX(BIB);
  const items = parseBibTeX(BIB).items as CSLItem[];

  it('reads every entry', () => {
    expect(items).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it('strips the brace protection the format needs', () => {
    expect(items[0]!.title).toBe('Nanometre-scale thermometry in a living cell');
  });

  it('maps entry types onto CSL', () => {
    expect(items[0]!.type).toBe('article-journal');
    expect(items[1]!.type).toBe('book');
  });

  it('splits names on "and" and keeps a braced organisation whole', () => {
    expect(items[0]!.author).toHaveLength(3);
    expect(items[0]!.author?.[0]).toEqual({ family: 'Kucsko', given: 'G.' });
    expect(items[0]!.author?.[2]).toEqual({ literal: 'The Nature Collaboration' });
  });

  it('normalises the double-hyphen page range', () => {
    expect(items[0]!.page).toBe('54-58');
  });

  it('combines month and year without inventing a day', () => {
    expect(items[0]!.issued).toEqual({ 'date-parts': [[2013, 7]] });
  });

  it('decodes TeX accents and escapes', () => {
    // Left alone, these import as literal backslashes in an author's name.
    expect(items[1]!.author?.[0]).toEqual({ family: 'Peña', given: 'José' });
    expect(items[1]!.title).toBe('DNA Methylation in Cost & Effect');
  });

  it('survives a brace inside a title instead of truncating the record', () => {
    const tricky = '@book{k, title = {{A {nested} brace}}, author = {A, B}, year = {2000}}';
    expect((parseBibTeX(tricky).items as CSLItem[])[0]!.title).toBe('A nested brace');
  });

  it('skips an entry with no title rather than importing a blank', () => {
    expect(parseBibTeX('@book{k, year = {2000}}').skipped).toBe(1);
  });
});

describe('decodeTeX', () => {
  it('handles both accent spellings', () => {
    expect(decodeTeX('Sch{\\"o}n')).toBe('Schön');
    expect(decodeTeX('Sch\\"{o}n')).toBe('Schön');
    expect(decodeTeX('Wei{\\ss}')).toBe('Weiß');
  });
});

describe('RIS import', () => {
  const { skipped } = parseRIS(RIS);
  const items = parseRIS(RIS).items as CSLItem[];

  it('reads every record', () => {
    expect(items).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it('joins SP and EP back into a page range', () => {
    expect(items[0]!.page).toBe('54-58');
  });

  it('tells an ISSN from an ISBN by its shape', () => {
    expect(items[0]!.ISSN).toBe('0028-0836');
    expect(items[0]!.ISBN).toBeUndefined();
    expect(items[1]!.ISBN).toBe('9780226025988');
  });

  it('reads the full date when one is given', () => {
    expect(items[0]!.issued).toEqual({ 'date-parts': [[2013, 7, 31]] });
    expect(items[1]!.issued).toEqual({ 'date-parts': [[1958]] });
  });

  it('joins a wrapped value rather than dropping the continuation', () => {
    const wrapped = 'TY  - JOUR\nTI  - A very long title that\n      continues here\nER  - \n';
    expect((parseRIS(wrapped).items as CSLItem[])[0]!.title).toBe('A very long title that continues here');
  });

  it('reads records that use LF alone', () => {
    expect(parseRIS(RIS.replace(/\r/g, '')).items).toHaveLength(2);
  });
});

describe('round trip', () => {
  const ORIGINAL: CSLItem = {
    id: '1',
    type: 'article-journal',
    title: 'Attention Is All You Need',
    'container-title': 'Advances in NIPS',
    author: [{ family: 'Vaswani', given: 'Ashish' }],
    volume: '30',
    page: '5998-6008',
    DOI: '10.48550/arXiv.1706.03762',
    issued: { 'date-parts': [[2017]] },
  };

  it('survives export to BibTeX and back', () => {
    const back = parseReferences(toBibTeX([ORIGINAL])).items[0]! as CSLItem;
    expect(back.title).toBe(ORIGINAL.title);
    expect(back.type).toBe('article-journal');
    expect(back.author).toEqual(ORIGINAL.author);
    expect(back.page).toBe('5998-6008');
    expect(back.DOI).toBe(ORIGINAL.DOI);
    expect(back.issued).toEqual({ 'date-parts': [[2017]] });
  });

  it('survives export to RIS and back', () => {
    const back = parseReferences(toRIS([ORIGINAL])).items[0]! as CSLItem;
    expect(back.title).toBe(ORIGINAL.title);
    expect(back.type).toBe('article-journal');
    expect(back.author).toEqual(ORIGINAL.author);
    expect(back.page).toBe('5998-6008');
    expect(back['container-title']).toBe('Advances in NIPS');
  });

  it('survives export to CSL JSON and back unchanged', () => {
    const back = parseReferences(JSON.stringify([ORIGINAL])).items[0]! as CSLItem;
    const { id: _drop, ...expected } = ORIGINAL;
    expect(back).toEqual(expected);
  });
});

describe('bad input', () => {
  it('reports unknown rather than guessing', () => {
    expect(parseReferences('hello there').format).toBe('unknown');
  });

  it('does not throw on malformed JSON', () => {
    expect(parseReferences('{ not json }').items).toEqual([]);
  });
});
