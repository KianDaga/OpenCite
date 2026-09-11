import { parseDate, parseName, type CSLItem, type CSLItemType } from '@opencite/shared';

/**
 * Reading references back in: BibTeX, RIS and CSL JSON.
 *
 * The mirror of `src/export`. Anyone moving off Zotero, Mendeley or a LaTeX
 * project arrives with one of these three files, and a citation tool that can
 * only be typed into is a tool people leave.
 *
 * Every parser is forgiving on input and strict on output: real files in these
 * formats are full of small deviations, so a record that cannot be understood
 * is skipped and reported rather than allowed to abort the whole import.
 */

export interface ImportResult {
  items: Array<Omit<CSLItem, 'id'>>;
  /** Records that could not be read, for an honest summary afterwards. */
  skipped: number;
  format: 'bibtex' | 'ris' | 'csl-json' | 'unknown';
}

/** Works out which format a pasted or uploaded blob is. */
export function detectFormat(text: string): ImportResult['format'] {
  const sample = text.trimStart().slice(0, 4000);
  if (sample.startsWith('[') || sample.startsWith('{')) return 'csl-json';
  if (/^@[a-z]+\s*[{(]/im.test(sample)) return 'bibtex';
  if (/^TY\s{2}-\s/m.test(sample)) return 'ris';
  return 'unknown';
}

// ---------------------------------------------------------------- CSL JSON

function parseCSLJSON(text: string): ImportResult {
  try {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const items = list.filter(
      (entry): entry is CSLItem => typeof entry === 'object' && entry !== null,
    );
    return {
      items: items.map(({ id: _drop, ...rest }) => rest as Omit<CSLItem, 'id'>),
      skipped: list.length - items.length,
      format: 'csl-json',
    };
  } catch {
    return { items: [], skipped: 1, format: 'csl-json' };
  }
}

// ------------------------------------------------------------------ BibTeX

const BIBTEX_TO_CSL: Record<string, CSLItemType> = {
  article: 'article-journal',
  book: 'book',
  booklet: 'pamphlet',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  manual: 'report',
  mastersthesis: 'thesis',
  phdthesis: 'thesis',
  misc: 'document',
  proceedings: 'book',
  techreport: 'report',
  unpublished: 'manuscript',
  online: 'webpage',
  electronic: 'webpage',
  www: 'webpage',
};

/**
 * Undoes the escaping and brace-protection that `toBibTeX` applies, plus the
 * commonest TeX accent forms — `{\"o}` and `\"{o}` both mean ö, and a name
 * imported as a literal backslash is a wrong citation.
 */
const TEX_ACCENTS: Record<string, Record<string, string>> = {
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', y: 'ÿ', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' },
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', n: 'ń', c: 'ć', s: 'ś', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
  c: { c: 'ç', C: 'Ç' },
  v: { s: 'š', c: 'č', z: 'ž', S: 'Š', C: 'Č', Z: 'Ž' },
};

export function decodeTeX(value: string): string {
  let out = value;

  // {\"o} / \"{o} / \"o, and the letter-command forms \c{c}, \v{s}.
  out = out.replace(/\{?\\([a-zA-Z"'`^~])\{?\\?([a-zA-Z])\}?\}?/g, (match, accent: string, letter: string) => {
    const mapped = TEX_ACCENTS[accent]?.[letter];
    return mapped ?? match;
  });

  out = out
    .replace(/\\ss\{?\}?/g, 'ß')
    .replace(/\{\\AA\}|\\AA/g, 'Å')
    .replace(/\{\\aa\}|\\aa/g, 'å')
    .replace(/\{\\o\}|\\o(?![a-zA-Z])/g, 'ø')
    .replace(/\\textbackslash\{\}/g, '\\')
    .replace(/\\textasciitilde\{\}/g, '~')
    .replace(/\\textasciicircum\{\}/g, '^')
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    // Brace protection carries no meaning once the value is CSL.
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return out;
}

/** Splits `a = {b}, c = {d}` respecting nested braces and quoted values. */
function splitBibTeXFields(body: string): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  let depth = 0;
  let quoted = false;
  let current = '';

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '"' && depth === 0) quoted = !quoted;

    if (char === ',' && depth === 0 && !quoted) {
      fields.push(splitPair(current));
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) fields.push(splitPair(current));

  return fields.filter(([key]) => key !== '');
}

/**
 * Returns the value with its outermost delimiter removed but its inner braces
 * intact. Decoding happens at the point of use, because in a name field a pair
 * of braces is not decoration — it is what marks an institutional author.
 */
function splitPair(chunk: string): [string, string] {
  const eq = chunk.indexOf('=');
  if (eq === -1) return ['', ''];
  const key = chunk.slice(0, eq).trim().toLowerCase();
  let value = chunk.slice(eq + 1).trim();
  if (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value.trim()];
}

/**
 * Splits an author list on " and ", keeping a brace-wrapped entry whole.
 *
 * `{The Nature Collaboration}` is how BibTeX says "this is one organisation,
 * not a person". Decoding the braces away first and then parsing the name
 * produces an author called Collaboration, The Nature — which is exactly the
 * kind of wrong that looks plausible in a bibliography.
 */
function bibtexNames(value: string) {
  return value
    .split(/\s+and\s+/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const braced = /^\{(.*)\}$/s.exec(name);
      if (braced) return { literal: decodeTeX(braced[1]!) };
      return parseName(decodeTeX(name));
    });
}

export function parseBibTeX(text: string): ImportResult {
  const items: Array<Omit<CSLItem, 'id'>> = [];
  let skipped = 0;

  // Walk entries by brace balance rather than by regex: a title containing a
  // brace would otherwise truncate the record.
  const entryStart = /@([a-zA-Z]+)\s*[{(]/g;
  for (let match = entryStart.exec(text); match; match = entryStart.exec(text)) {
    const type = match[1]!.toLowerCase();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;

    let depth = 1;
    let index = match.index + match[0].length;
    while (index < text.length && depth > 0) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') depth -= 1;
      index += 1;
    }

    const body = text.slice(match.index + match[0].length, index - 1);
    // The cite key sits before the first comma and is not a field.
    const firstComma = body.indexOf(',');
    const fieldText = firstComma === -1 ? '' : body.slice(firstComma + 1);
    const raw = new Map(splitBibTeXFields(fieldText));
    // Names keep their braces; every other value is plain text from here on.
    const fields = new Map(
      [...raw].map(([key, value]) =>
        key === 'author' || key === 'editor' ? [key, value] : [key, decodeTeX(value)],
      ),
    );

    const title = fields.get('title');
    if (!title) {
      skipped += 1;
      continue;
    }

    // `--` may already have become an en dash, and plenty of files use one.
    const pages = fields.get('pages')?.replace(/\s*(?:--+|[\u2013\u2014])\s*/g, '-');
    const cslType = BIBTEX_TO_CSL[type] ?? 'document';
    const container = fields.get('journal') ?? fields.get('booktitle');

    const item: Record<string, unknown> = {
      type: cslType,
      title,
      ...(container ? { 'container-title': container } : {}),
      ...(fields.get('author') ? { author: bibtexNames(fields.get('author')!) } : {}),
      ...(fields.get('editor') ? { editor: bibtexNames(fields.get('editor')!) } : {}),
      ...(fields.get('publisher') ? { publisher: fields.get('publisher') } : {}),
      ...(fields.get('school') ? { publisher: fields.get('school') } : {}),
      ...(fields.get('institution') ? { publisher: fields.get('institution') } : {}),
      ...(fields.get('address') ? { 'publisher-place': fields.get('address') } : {}),
      ...(fields.get('volume') ? { volume: fields.get('volume') } : {}),
      ...(fields.get('number') ? { issue: fields.get('number') } : {}),
      ...(pages ? { page: pages } : {}),
      ...(fields.get('edition') ? { edition: fields.get('edition') } : {}),
      ...(fields.get('doi') ? { DOI: fields.get('doi') } : {}),
      ...(fields.get('isbn') ? { ISBN: fields.get('isbn') } : {}),
      ...(fields.get('issn') ? { ISSN: fields.get('issn') } : {}),
      ...(fields.get('url') ? { URL: fields.get('url') } : {}),
      ...(fields.get('abstract') ? { abstract: fields.get('abstract') } : {}),
      ...(fields.get('note') ? { note: fields.get('note') } : {}),
      ...(fields.get('language') ? { language: fields.get('language') } : {}),
    };

    const year = fields.get('year');
    const month = fields.get('month');
    if (year) {
      const issued = parseDate(month ? `${month} ${year}` : year);
      if (issued) item.issued = issued;
    }

    const urldate = fields.get('urldate');
    if (urldate) {
      const accessed = parseDate(urldate);
      if (accessed) item.accessed = accessed;
    }

    items.push(item as Omit<CSLItem, 'id'>);
  }

  return { items, skipped, format: 'bibtex' };
}

// --------------------------------------------------------------------- RIS

const RIS_TO_CSL: Record<string, CSLItemType> = {
  JOUR: 'article-journal',
  MGZN: 'article-magazine',
  NEWS: 'article-newspaper',
  BOOK: 'book',
  EBOOK: 'book',
  CHAP: 'chapter',
  CPAPER: 'paper-conference',
  CONF: 'paper-conference',
  THES: 'thesis',
  RPRT: 'report',
  ELEC: 'webpage',
  BLOG: 'post-weblog',
  ICOMM: 'post',
  DATA: 'dataset',
  COMP: 'software',
  MAP: 'map',
  MPCT: 'motion_picture',
  SOUND: 'broadcast',
  SPCH: 'speech',
  UNPB: 'manuscript',
  MANSCPT: 'manuscript',
  PAT: 'patent',
  CASE: 'legal_case',
  STAT: 'legislation',
  ENCYC: 'entry-encyclopedia',
  DICT: 'entry-dictionary',
  STAND: 'standard',
  GEN: 'document',
};

/**
 * RIS writes dates as `YYYY/MM/DD`, with trailing separators for a partial
 * date and an optional free-text part after a fourth slash. Handed over
 * unchanged, only the year survives.
 */
function risDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [date] = value.split('/').slice(0, 3).join('/').split('//');
  const parts = (date ?? '').split('/').filter((part) => part.trim() !== '');
  if (parts.length === 0) return value;
  return parts.join('-');
}

export function parseRIS(text: string): ImportResult {
  const items: Array<Omit<CSLItem, 'id'>> = [];
  let skipped = 0;

  // Records run from TY to ER. Split on ER so a missing trailing newline or a
  // stray blank line between records does not lose the last one.
  const records = text.split(/^ER\s{2}-.*$/m).filter((chunk) => /^TY\s{2}-/m.test(chunk));

  for (const record of records) {
    const tags = new Map<string, string[]>();
    let lastTag = '';

    for (const rawLine of record.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+$/, '');
      if (!line.trim()) continue;

      const match = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/.exec(line);
      if (match) {
        lastTag = match[1]!;
        const list = tags.get(lastTag) ?? [];
        list.push(match[2] ?? '');
        tags.set(lastTag, list);
      } else if (lastTag) {
        // A wrapped continuation of the previous value.
        const list = tags.get(lastTag)!;
        list[list.length - 1] = `${list[list.length - 1]} ${line.trim()}`.trim();
      }
    }

    const first = (tag: string) => tags.get(tag)?.[0]?.trim() || undefined;
    const title = first('TI') ?? first('T1') ?? first('BT');
    if (!title) {
      skipped += 1;
      continue;
    }

    const startPage = first('SP');
    const endPage = first('EP');
    const item: Record<string, unknown> = {
      type: RIS_TO_CSL[first('TY') ?? 'GEN'] ?? 'document',
      title,
      ...(first('T2') ? { 'container-title': first('T2') } : {}),
      ...(first('T3') ? { 'collection-title': first('T3') } : {}),
      ...((tags.get('AU') ?? tags.get('A1'))?.length
        ? { author: (tags.get('AU') ?? tags.get('A1'))!.map((n) => parseName(n.replace(/,(?=\S)/, ', '))) }
        : {}),
      ...(tags.get('ED')?.length
        ? { editor: tags.get('ED')!.map((n) => parseName(n.replace(/,(?=\S)/, ', '))) }
        : {}),
      ...(first('AB') ? { abstract: first('AB') } : {}),
      ...(first('VL') ? { volume: first('VL') } : {}),
      ...(first('IS') ? { issue: first('IS') } : {}),
      ...(startPage ? { page: endPage ? `${startPage}-${endPage}` : startPage } : {}),
      ...(first('PB') ? { publisher: first('PB') } : {}),
      ...(first('CY') ? { 'publisher-place': first('CY') } : {}),
      ...(first('ET') ? { edition: first('ET') } : {}),
      ...(first('DO') ? { DOI: first('DO') } : {}),
      ...(first('UR') ? { URL: first('UR') } : {}),
      ...(first('LA') ? { language: first('LA') } : {}),
      ...(first('N1') ? { note: first('N1') } : {}),
      ...(tags.get('KW')?.length ? { keyword: tags.get('KW')!.join(', ') } : {}),
    };

    // SN carries an ISBN for books and an ISSN for periodicals; the hyphen
    // pattern tells them apart more reliably than the record type.
    const sn = first('SN');
    if (sn) {
      if (/^\d{4}-\d{3}[\dxX]$/.test(sn.trim())) item.ISSN = sn;
      else item.ISBN = sn;
    }

    const issued = parseDate(risDate(first('DA') ?? first('PY') ?? first('Y1')));
    if (issued) item.issued = issued;

    const accessed = parseDate(risDate(first('Y2')));
    if (accessed) item.accessed = accessed;

    items.push(item as Omit<CSLItem, 'id'>);
  }

  return { items, skipped, format: 'ris' };
}

/** Parses whatever was pasted or uploaded, detecting the format. */
export function parseReferences(text: string): ImportResult {
  switch (detectFormat(text)) {
    case 'csl-json':
      return parseCSLJSON(text);
    case 'bibtex':
      return parseBibTeX(text);
    case 'ris':
      return parseRIS(text);
    default:
      return { items: [], skipped: 0, format: 'unknown' };
  }
}
