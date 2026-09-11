import type { CSLDate, CSLItem, CSLItemType, CSLName } from '@opencite/shared';

/**
 * CSL-JSON → BibTeX.
 *
 * BibTeX is not a format so much as a set of conventions, and two of them
 * matter enough to be worth stating:
 *
 * 1. **Titles get braced.** BibTeX lowercases title words according to the
 *    style unless they are protected, so an unbraced "DNA methylation in
 *    Arabidopsis" comes out as "Dna methylation in arabidopsis". Wrapping the
 *    whole title in a second pair of braces preserves what the source wrote.
 * 2. **Cite keys have to be unique.** Two papers by the same author in the
 *    same year collide, and LaTeX silently uses whichever it saw last. So keys
 *    are suffixed a/b/c on collision.
 */

/** CSL type → BibTeX entry type. */
const ENTRY_TYPES: Partial<Record<CSLItemType, string>> = {
  'article-journal': 'article',
  'article-magazine': 'article',
  'article-newspaper': 'article',
  article: 'article',
  book: 'book',
  chapter: 'incollection',
  'paper-conference': 'inproceedings',
  thesis: 'phdthesis',
  report: 'techreport',
  manuscript: 'unpublished',
  'entry-encyclopedia': 'incollection',
  'entry-dictionary': 'incollection',
  webpage: 'misc',
  'post-weblog': 'misc',
  post: 'misc',
  dataset: 'misc',
  software: 'misc',
  speech: 'misc',
  broadcast: 'misc',
  motion_picture: 'misc',
  map: 'misc',
  patent: 'misc',
  legal_case: 'misc',
  legislation: 'misc',
};

/**
 * Characters BibTeX reads as markup. Escaping is minimal on purpose:
 * over-escaping produces literal backslashes in the output, which is worse
 * than the occasional field a user has to tidy.
 */
function escapeBibTeX(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/** BibTeX names: "Family, Given" joined by " and ". */
function formatNames(names: CSLName[] | undefined): string | undefined {
  if (!names?.length) return undefined;
  return names
    .map((name) => {
      // Braces keep an institutional name from being parsed as a person.
      if (name.literal) return `{${escapeBibTeX(name.literal)}}`;
      const particle = name['non-dropping-particle'];
      const family = [particle, name.family].filter(Boolean).join(' ');
      const given = [name.given, name.suffix].filter(Boolean).join(', ');
      return given ? `${escapeBibTeX(family)}, ${escapeBibTeX(given)}` : escapeBibTeX(family);
    })
    .join(' and ');
}

function yearOf(date: CSLDate | undefined): string | undefined {
  const parts = date?.['date-parts']?.[0];
  if (parts?.[0]) return String(parts[0]);
  if (date?.literal) return date.literal;
  return undefined;
}

function monthOf(date: CSLDate | undefined): string | undefined {
  const month = date?.['date-parts']?.[0]?.[1];
  if (!month) return undefined;
  // BibTeX's three-letter month macros, unbraced so they resolve.
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][
    month - 1
  ];
}

const NON_KEY_CHARS = /[^a-zA-Z0-9]/g;

/** `arendt1958human` — the convention most people expect. */
export function citeKeyFor(item: CSLItem): string {
  const first = item.author?.[0] ?? item.editor?.[0];
  const name = (first?.family ?? first?.literal ?? 'anon')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(NON_KEY_CHARS, '')
    .toLowerCase();

  const year = yearOf(item.issued)?.replace(NON_KEY_CHARS, '') ?? 'nd';

  // The first title word that carries meaning.
  const stopWords = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'and', 'for', 'to']);
  const word =
    (item.title ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find((w) => w.length > 2 && !stopWords.has(w)) ?? '';

  return `${name}${year}${word}`.slice(0, 40) || 'ref';
}

type FieldMap = Array<[string, string | undefined]>;

function fieldsFor(item: CSLItem): FieldMap {
  const container = item['container-title'];
  const isArticle = item.type === 'article-journal' || item.type === 'article-magazine' || item.type === 'article-newspaper';

  return [
    ['author', formatNames(item.author)],
    ['editor', formatNames(item.editor)],
    ['translator', formatNames(item.translator)],
    // Double-braced so BibTeX styles cannot re-case it.
    ['title', item.title ? `{${escapeBibTeX(item.title)}}` : undefined],
    [isArticle ? 'journal' : 'booktitle', container ? escapeBibTeX(container) : undefined],
    ['publisher', item.publisher ? escapeBibTeX(item.publisher) : undefined],
    ['address', item['publisher-place'] ? escapeBibTeX(item['publisher-place']) : undefined],
    ['school', item.type === 'thesis' && item.publisher ? escapeBibTeX(item.publisher) : undefined],
    ['institution', item.type === 'report' && item.publisher ? escapeBibTeX(item.publisher) : undefined],
    ['volume', item.volume !== undefined ? String(item.volume) : undefined],
    ['number', item.issue !== undefined ? String(item.issue) : item.number !== undefined ? String(item.number) : undefined],
    ['pages', item.page ? String(item.page).replace(/-+/g, '--') : undefined],
    ['edition', item.edition !== undefined ? String(item.edition) : undefined],
    ['year', yearOf(item.issued)],
    ['month', monthOf(item.issued)],
    ['doi', item.DOI],
    ['isbn', item.ISBN],
    ['issn', item.ISSN],
    ['url', item.URL],
    ['urldate', item.accessed ? isoDate(item.accessed) : undefined],
    ['note', item.note ? escapeBibTeX(item.note) : undefined],
    ['abstract', item.abstract ? escapeBibTeX(item.abstract) : undefined],
    ['language', item.language],
  ];
}

function isoDate(date: CSLDate): string | undefined {
  const parts = date['date-parts']?.[0];
  if (!parts?.length) return date.literal;
  return parts.map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join('-');
}

/** Values that already carry their own braces or are macros stay unquoted. */
function wrapValue(field: string, value: string): string {
  if (field === 'month') return value;
  if (value.startsWith('{') && value.endsWith('}')) return `{${value}}`;
  return `{${value}}`;
}

export function toBibTeX(items: CSLItem[]): string {
  const usedKeys = new Map<string, number>();

  const entries = items.map((item) => {
    const base = citeKeyFor(item);
    const seen = usedKeys.get(base) ?? 0;
    usedKeys.set(base, seen + 1);
    // Collisions get a, b, c — LaTeX would otherwise silently keep only one.
    const key = seen === 0 ? base : `${base}${String.fromCharCode(96 + seen)}`;

    const type = ENTRY_TYPES[item.type] ?? 'misc';
    const lines = fieldsFor(item)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([field, value]) => `  ${field} = ${wrapValue(field, value)},`);

    return `@${type}{${key},\n${lines.join('\n')}\n}`;
  });

  return entries.join('\n\n') + (entries.length ? '\n' : '');
}
