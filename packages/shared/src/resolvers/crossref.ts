import type { CSLItem, CSLItemType } from '../csl';
import type { LookupResult } from '../api';
import type { JSONFetcher } from './fetcher';
import { compactCSL, stripMarkup } from '../cslBuild';

/**
 * Crossref — the registry behind most journal DOIs.
 *
 * Crossref's JSON is close to CSL but not CSL: it uses its own type
 * vocabulary, wraps single-valued fields in arrays, and carries bookkeeping
 * (`member`, `is-referenced-by-count`, author `affiliation`/`sequence`) that
 * has no business in a bibliography. Its `/transform` endpoint advertises CSL
 * output but still returns those Crossref types, so the mapping is done here
 * rather than trusted to the upstream.
 */

const API = 'https://api.crossref.org/works';

/** Crossref's `type` vocabulary → CSL's. */
const TYPE_MAP: Record<string, CSLItemType> = {
  'journal-article': 'article-journal',
  'journal-issue': 'article-journal',
  'journal-volume': 'article-journal',
  journal: 'periodical',
  'proceedings-article': 'paper-conference',
  proceedings: 'book',
  dataset: 'dataset',
  'posted-content': 'article',
  dissertation: 'thesis',
  'book-chapter': 'chapter',
  'book-part': 'chapter',
  'book-section': 'chapter',
  'book-series': 'book',
  'book-set': 'book',
  'book-track': 'chapter',
  'edited-book': 'book',
  'reference-book': 'book',
  monograph: 'book',
  book: 'book',
  component: 'article',
  report: 'report',
  'report-series': 'report',
  standard: 'standard',
  'peer-review': 'review',
  other: 'document',
};

interface CrossrefName {
  given?: string;
  family?: string;
  name?: string;
  suffix?: string;
}

interface CrossrefWork {
  DOI?: string;
  type?: string;
  title?: string[];
  'short-title'?: string[];
  subtitle?: string[];
  'container-title'?: string[];
  author?: CrossrefName[];
  editor?: CrossrefName[];
  translator?: CrossrefName[];
  publisher?: string;
  'publisher-location'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  edition?: string;
  ISSN?: string[];
  ISBN?: string[];
  URL?: string;
  abstract?: string;
  language?: string;
  issued?: { 'date-parts'?: number[][] };
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  'event'?: { name?: string; location?: string };
}

/** Crossref uses `name` for institutional contributors, `family` for people. */
function toNames(list: CrossrefName[] | undefined) {
  return (list ?? []).map((person) =>
    person.family
      ? {
          family: person.family,
          given: person.given ?? '',
          ...(person.suffix ? { suffix: person.suffix } : {}),
        }
      : { literal: person.name ?? [person.given, person.family].filter(Boolean).join(' ') },
  );
}

function toDate(value: { 'date-parts'?: number[][] } | undefined) {
  const parts = value?.['date-parts']?.[0];
  if (!parts || parts.length === 0 || parts[0] === undefined) return undefined;
  return { 'date-parts': [parts] } as CSLItem['issued'];
}

export function crossrefToCSL(work: CrossrefWork, id: string): CSLItem {
  // Crossref splits a subtitle out; styles expect one title.
  const title = [work.title?.[0], work.subtitle?.[0]].filter(Boolean).join(': ');

  return compactCSL({
    id,
    type: TYPE_MAP[work.type ?? ''] ?? 'document',
    title,
    'title-short': work['short-title']?.[0],
    'container-title': work['container-title']?.[0],
    author: toNames(work.author),
    editor: toNames(work.editor),
    translator: toNames(work.translator),
    publisher: work.publisher,
    'publisher-place': work['publisher-location'] ?? work.event?.location,
    volume: work.volume,
    issue: work.issue,
    page: work.page,
    edition: work.edition,
    ISSN: work.ISSN?.[0],
    ISBN: work.ISBN?.[0],
    DOI: work.DOI,
    URL: work.URL,
    language: work.language,
    abstract: stripMarkup(work.abstract),
    // `issued` is the date of record; fall back to whichever version exists.
    issued: toDate(work.issued) ?? toDate(work['published-print']) ?? toDate(work['published-online']),
    'event-title': work.event?.name,
  });
}

export async function resolveCrossrefDOI(doi: string, fetchJSON: JSONFetcher): Promise<LookupResult | undefined> {
  const response = await fetchJSON<{ message?: CrossrefWork }>(
    `${API}/${encodeURIComponent(doi)}`,
  );
  const work = response?.message;
  if (!work?.DOI) return undefined;

  return {
    csl: crossrefToCSL(work, doi),
    resolver: 'crossref',
    key: `doi:${doi.toLowerCase()}`,
    // Registry metadata for a registered DOI is as good as it gets.
    confidence: 0.97,
  };
}

/** Free-text search, for the "I only know the title" case. */
export async function searchCrossref(
  query: string,
  fetchJSON: JSONFetcher,
  rows = 5,
): Promise<LookupResult[]> {
  const url = `${API}?query.bibliographic=${encodeURIComponent(query)}&rows=${rows}&select=DOI,type,title,subtitle,container-title,author,publisher,volume,issue,page,ISSN,ISBN,URL,issued,language`;
  const response = await fetchJSON<{ message?: { items?: CrossrefWork[] } }>(url);

  return (response?.message?.items ?? [])
    .filter((work) => work.DOI)
    .map((work, index) => ({
      csl: crossrefToCSL(work, work.DOI!),
      resolver: 'crossref' as const,
      key: `doi:${work.DOI!.toLowerCase()}`,
      // A search match is a guess, and later matches are weaker guesses.
      confidence: Math.max(0.3, 0.6 - index * 0.05),
    }));
}
