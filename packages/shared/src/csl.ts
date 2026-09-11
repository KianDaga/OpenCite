/**
 * CSL-JSON — the interchange format consumed by citeproc-js.
 *
 * These types mirror the official `csl-data.json` schema
 * (https://github.com/citation-style-language/schema). We store citation
 * metadata in exactly this shape so that nothing has to be transformed on the
 * way into the formatter: `citeproc.updateItems()` receives our rows verbatim,
 * and BibTeX/RIS exporters (Step 5) map out of a single canonical model.
 */

/** Every item type defined by the CSL 1.0.2 schema. */
export type CSLItemType =
  | 'article'
  | 'article-journal'
  | 'article-magazine'
  | 'article-newspaper'
  | 'bill'
  | 'book'
  | 'broadcast'
  | 'chapter'
  | 'classic'
  | 'collection'
  | 'dataset'
  | 'document'
  | 'entry'
  | 'entry-dictionary'
  | 'entry-encyclopedia'
  | 'event'
  | 'figure'
  | 'graphic'
  | 'hearing'
  | 'interview'
  | 'legal_case'
  | 'legislation'
  | 'manuscript'
  | 'map'
  | 'motion_picture'
  | 'musical_score'
  | 'pamphlet'
  | 'paper-conference'
  | 'patent'
  | 'performance'
  | 'periodical'
  | 'personal_communication'
  | 'post'
  | 'post-weblog'
  | 'regulation'
  | 'report'
  | 'review'
  | 'review-book'
  | 'software'
  | 'song'
  | 'speech'
  | 'standard'
  | 'thesis'
  | 'treaty'
  | 'webpage';

/**
 * A CSL name. Either structured (`family` + `given`) or a single unparsed
 * `literal` for institutional authors — never both.
 */
export interface CSLName {
  family?: string;
  given?: string;
  'dropping-particle'?: string;
  'non-dropping-particle'?: string;
  suffix?: string;
  'comma-suffix'?: boolean | string | number;
  'static-ordering'?: boolean | string | number;
  literal?: string;
  'parse-names'?: boolean | string | number;
}

/** A single date part: `[year]`, `[year, month]` or `[year, month, day]`. */
export type CSLDatePart = [number] | [number, number] | [number, number, number];

/**
 * A CSL date. `date-parts` holds one entry for a point in time and two for a
 * range. `raw` is a fallback for strings we could not parse; `literal` is for
 * dates that should be printed as-is ("n.d.", "Spring 2020").
 */
export interface CSLDate {
  'date-parts'?: CSLDatePart[];
  season?: string | number;
  circa?: boolean | string | number;
  literal?: string;
  raw?: string;
  edtf?: string;
}

/** All name variables recognised by CSL. */
export type CSLNameVariable =
  | 'author'
  | 'chair'
  | 'collection-editor'
  | 'compiler'
  | 'composer'
  | 'container-author'
  | 'contributor'
  | 'curator'
  | 'director'
  | 'editor'
  | 'editorial-director'
  | 'editor-translator'
  | 'executive-producer'
  | 'guest'
  | 'host'
  | 'illustrator'
  | 'interviewer'
  | 'narrator'
  | 'organizer'
  | 'original-author'
  | 'performer'
  | 'producer'
  | 'recipient'
  | 'reviewed-author'
  | 'script-writer'
  | 'series-creator'
  | 'translator';

/** All date variables recognised by CSL. */
export type CSLDateVariable =
  | 'accessed'
  | 'available-date'
  | 'event-date'
  | 'issued'
  | 'original-date'
  | 'submitted';

/**
 * A CSL-JSON item. Name and date variables are strongly typed; the remaining
 * (~80) standard variables are strings or numbers, so they are modelled with an
 * index signature rather than enumerated — this keeps us forward-compatible
 * with CSL schema additions instead of silently dropping unknown fields.
 */
export type CSLItem = {
  /** Stable key. Mirrors `Citation.id` so citeproc registry lookups are 1:1. */
  id: string;
  type: CSLItemType;
  title?: string;
  'container-title'?: string;
  'collection-title'?: string;
  publisher?: string;
  'publisher-place'?: string;
  page?: string;
  volume?: string | number;
  issue?: string | number;
  edition?: string | number;
  number?: string | number;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  PMID?: string;
  PMCID?: string;
  URL?: string;
  abstract?: string;
  language?: string;
  note?: string;
  /** Shortened title used by some styles (e.g. MLA in-text). */
  'title-short'?: string;
} & Partial<Record<CSLNameVariable, CSLName[]>> &
  Partial<Record<CSLDateVariable, CSLDate>> &
  Record<string, unknown>;

/** Minimal valid item — what a brand-new manual entry starts from. */
export function emptyCSLItem(id: string, type: CSLItemType = 'webpage'): CSLItem {
  return { id, type };
}
