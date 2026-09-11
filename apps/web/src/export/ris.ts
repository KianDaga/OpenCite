import type { CSLDate, CSLItem, CSLItemType, CSLName } from '@opencite/shared';

/**
 * CSL-JSON → RIS.
 *
 * RIS is what EndNote, Mendeley, RefWorks and most publisher "export citation"
 * buttons speak. The format is rigid in ways that matter: every record starts
 * with `TY` and ends with `ER`, tags are exactly two characters followed by
 * two spaces and a hyphen, and lines are CRLF-terminated. Readers that accept
 * deviations are the exception, so this sticks to the strict form.
 */

const TYPES: Partial<Record<CSLItemType, string>> = {
  'article-journal': 'JOUR',
  'article-magazine': 'MGZN',
  'article-newspaper': 'NEWS',
  article: 'GEN',
  book: 'BOOK',
  chapter: 'CHAP',
  'paper-conference': 'CPAPER',
  thesis: 'THES',
  report: 'RPRT',
  webpage: 'ELEC',
  'post-weblog': 'BLOG',
  post: 'ICOMM',
  dataset: 'DATA',
  software: 'COMP',
  map: 'MAP',
  motion_picture: 'MPCT',
  broadcast: 'SOUND',
  speech: 'SPCH',
  interview: 'UNPB',
  manuscript: 'MANSCPT',
  patent: 'PAT',
  legal_case: 'CASE',
  legislation: 'STAT',
  'entry-encyclopedia': 'ENCYC',
  'entry-dictionary': 'DICT',
  standard: 'STAND',
};

function nameToRIS(name: CSLName): string {
  if (name.literal) return name.literal;
  const particle = name['non-dropping-particle'];
  const family = [particle, name.family].filter(Boolean).join(' ');
  const given = [name.given, name.suffix].filter(Boolean).join(', ');
  return given ? `${family},${given}` : family;
}

function risDate(date: CSLDate | undefined): string | undefined {
  const parts = date?.['date-parts']?.[0];
  if (!parts?.length) return date?.literal;
  // RIS dates are YYYY/MM/DD, trailing separators kept for partial dates.
  const [year, month, day] = parts;
  return [year, month ? String(month).padStart(2, '0') : '', day ? String(day).padStart(2, '0') : '']
    .join('/')
    .replace(/\/+$/, '');
}

/** Newlines inside a value would be read as the start of a new tag. */
function flatten(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

export function toRIS(items: CSLItem[]): string {
  const records = items.map((item) => {
    const lines: Array<[string, string]> = [];
    const push = (tag: string, value: string | number | undefined) => {
      if (value === undefined || value === null || value === '') return;
      lines.push([tag, flatten(String(value))]);
    };

    // TY must come first — readers use it to decide how to read the rest.
    push('TY', TYPES[item.type] ?? 'GEN');

    for (const author of item.author ?? []) push('AU', nameToRIS(author));
    for (const editor of item.editor ?? []) push('ED', nameToRIS(editor));

    push('TI', item.title);
    push('T2', item['container-title']);
    push('T3', item['collection-title']);
    push('AB', item.abstract);

    const pages = String(item.page ?? '');
    const [start, end] = pages.split(/\s*[-–—]+\s*/);
    push('SP', start);
    push('EP', end);

    push('VL', item.volume);
    push('IS', item.issue);
    push('PB', item.publisher);
    push('CY', item['publisher-place']);
    push('ET', item.edition);
    push('SN', item.ISBN ?? item.ISSN);
    push('DO', item.DOI);
    push('UR', item.URL);
    push('LA', item.language);
    push('N1', item.note);

    const year = item.issued?.['date-parts']?.[0]?.[0];
    push('PY', year);
    push('DA', risDate(item.issued));
    push('Y2', risDate(item.accessed));

    for (const keyword of (item.keyword ? String(item.keyword).split(/,\s*/) : [])) {
      push('KW', keyword);
    }

    // ER closes the record and must be last.
    lines.push(['ER', '']);

    return lines.map(([tag, value]) => `${tag}  - ${value}`).join('\r\n');
  });

  return records.join('\r\n\r\n') + (records.length ? '\r\n' : '');
}
