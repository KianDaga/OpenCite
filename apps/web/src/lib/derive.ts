import type { CSLItem, CSLName, Citation } from '@opencite/shared';

/**
 * IndexedDB cannot index into a nested object, and it cannot do substring
 * search at all. So every write projects the parts of `csl` we need to query
 * onto flat, indexed columns. This module is the single place that mapping
 * lives — repositories call `deriveCitationIndexes()` on every create/update so
 * the projections can never drift from the payload they describe.
 */

/**
 * Name text for the search index. Order is irrelevant here — this exists so
 * that typing either half of a name matches — so do not use it for display.
 */
export function displayName(name: CSLName): string {
  if (name.literal) return name.literal;
  const particle = name['non-dropping-particle'] ?? '';
  return [particle, name.family, name.given].filter(Boolean).join(' ').trim();
}

/**
 * Name text for the reference list, in reading order: "Hannah Arendt", not
 * "Arendt Hannah". Formatting inside a citation is citeproc's job and follows
 * the style; this is only for OpenCite's own list.
 */
export function formatNameForDisplay(name: CSLName): string {
  if (name.literal) return name.literal;
  const particle = name['non-dropping-particle'] ?? '';
  const family = [particle, name.family].filter(Boolean).join(' ');
  return [name.given, family, name.suffix].filter(Boolean).join(' ').trim();
}

/** Family name of the first author — the primary bibliography sort key. */
export function primaryCreator(csl: CSLItem): string {
  const creators =
    csl.author ?? csl.editor ?? csl.translator ?? csl.director ?? csl['container-author'];
  const first = creators?.[0];
  if (!first) return '';
  return (first.family ?? first.literal ?? '').toLowerCase();
}

export function issuedYear(csl: CSLItem): string {
  const parts = csl.issued?.['date-parts']?.[0];
  if (parts && parts[0]) return String(parts[0]);
  if (csl.issued?.literal) return csl.issued.literal;
  return '';
}

/** `"lastname 2019 title"` — sorts author-date styles correctly by default. */
export function buildSortKey(csl: CSLItem): string {
  return [primaryCreator(csl), issuedYear(csl), (csl.title ?? '').toLowerCase()]
    .join(' ')
    .trim();
}

const SEARCHABLE_STRING_FIELDS = [
  'title',
  'container-title',
  'collection-title',
  'publisher',
  'publisher-place',
  'DOI',
  'ISBN',
  'ISSN',
  'URL',
  'abstract',
  'note',
] as const;

const SEARCHABLE_NAME_FIELDS = [
  'author',
  'editor',
  'translator',
  'director',
  'container-author',
] as const;

/** Everything the quick-search box should be able to match, lowercased. */
export function buildSearchBlob(csl: CSLItem, tags: string[], notes?: string): string {
  const chunks: string[] = [];
  for (const field of SEARCHABLE_STRING_FIELDS) {
    const value = csl[field];
    if (typeof value === 'string') chunks.push(value);
  }
  for (const field of SEARCHABLE_NAME_FIELDS) {
    for (const name of csl[field] ?? []) chunks.push(displayName(name));
  }
  chunks.push(issuedYear(csl), ...tags);
  if (notes) chunks.push(notes);
  return chunks.join(' ').toLowerCase();
}

/**
 * Distinct word tokens from the search blob. Stored under a multi-entry index
 * so `where('keywords').startsWithIgnoreCase(q)` gives prefix search that stays
 * fast at ten thousand references, instead of scanning every row.
 */
export function tokenize(blob: string): string[] {
  const tokens = blob
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 1);
  return [...new Set(tokens)];
}

export type CitationIndexes = Pick<
  Citation,
  'type' | 'sortKey' | 'searchBlob' | 'keywords'
>;

export function deriveCitationIndexes(
  csl: CSLItem,
  tags: string[] = [],
  notes?: string,
): CitationIndexes {
  const searchBlob = buildSearchBlob(csl, tags, notes);
  return {
    type: csl.type,
    sortKey: buildSortKey(csl),
    searchBlob,
    keywords: tokenize(searchBlob),
  };
}
