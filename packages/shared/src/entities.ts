import type { CSLItem, CSLItemType } from './csl';

/** Milliseconds since the Unix epoch. Stored as a number so it is indexable. */
export type Timestamp = number;

/** UUID v4 string. Generated client-side — there is no server to assign ids. */
export type ID = string;

/**
 * Sentinel for "no parent folder" / "unfiled".
 *
 * IndexedDB rejects `null` as a key: a row storing `parentId: null` is simply
 * absent from the `parentId` index, so `where({parentId: null})` would return
 * nothing and root-level items would disappear from the sidebar. An empty
 * string *is* a valid key, so absence of a parent is stored as ROOT and stays
 * queryable through the same compound indexes as every other folder.
 */
export const ROOT = '';
export type FolderRef = ID | typeof ROOT;

/**
 * A project is the top-level container: one bibliography, one citation style.
 * ZoteroBib has exactly one; MyBib has many. We model many from day one so the
 * sidebar (Step 4) has something to list.
 */
export interface Project {
  id: ID;
  name: string;
  /** CSL style id, e.g. `apa`, `modern-language-association`. */
  styleId: string;
  /** CSL locale, e.g. `en-US`, `en-GB`, `de-DE`. */
  localeId: string;
  /** How the bibliography rows are ordered in the UI. */
  sort: CitationSort;
  /** Ordering among sibling projects in the sidebar. */
  position: number;
  color?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Soft-delete flag. `0` = live, `1` = in trash. Indexed. */
  trashed: 0 | 1;
  deletedAt: Timestamp | null;
}

/**
 * Folders nest arbitrarily inside a project. `parentId === ROOT` means the
 * folder sits at the project root; a citation with `folderId === ROOT` is
 * "Unfiled" and shows up in the project's "All references" view.
 */
export interface Folder {
  id: ID;
  projectId: ID;
  parentId: FolderRef;
  name: string;
  position: number;
  color?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  trashed: 0 | 1;
  deletedAt: Timestamp | null;
}

/** Where a citation's metadata came from — drives re-fetch and provenance UI. */
export type CitationSourceKind =
  | 'url'
  | 'doi'
  | 'isbn'
  | 'pmid'
  | 'arxiv'
  | 'manual'
  | 'import';

export interface CitationSource {
  kind: CitationSourceKind;
  /** The raw identifier the user pasted, before normalisation. */
  input: string;
  /** Normalised lookup key — also the `MetadataCacheEntry` primary key. */
  key: string;
  /** Which backend resolver answered: `crossref`, `openlibrary`, `metascraper`… */
  resolver?: string;
  /** When the metadata was last fetched from the network. */
  fetchedAt?: Timestamp;
  /** True once the user has hand-edited the auto-fetched metadata. */
  edited?: boolean;
}

/**
 * A single reference. `csl` is the canonical payload and the only thing handed
 * to citeproc-js. Everything alongside it is either OpenCite bookkeeping or a
 * denormalised projection of `csl` that exists purely so IndexedDB can index
 * and sort it — those projections are rebuilt on every write by
 * `deriveCitationIndexes()` and must never be edited directly.
 */
export interface Citation {
  id: ID;
  projectId: ID;
  /** `ROOT` = unfiled (project root). */
  folderId: FolderRef;

  /** Canonical CSL-JSON metadata. `csl.id` always equals `Citation.id`. */
  csl: CSLItem;

  // ---- Denormalised, derived from `csl` on write (do not hand-edit) ----
  /** Mirrors `csl.type`; indexed so the table can filter by type. */
  type: CSLItemType;
  /** `"lastname year title"`, lowercased — the default bibliography sort key. */
  sortKey: string;
  /** Lowercased blob of every searchable field, for substring matching. */
  searchBlob: string;
  /** Tokenised `searchBlob`, multi-entry indexed for fast prefix search. */
  keywords: string[];

  // ---- User data ----
  tags: string[];
  notes?: string;
  favorite: 0 | 1;

  source: CitationSource;
  position: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  trashed: 0 | 1;
  deletedAt: Timestamp | null;
}

export type CitationSortField =
  | 'sortKey'
  | 'createdAt'
  | 'updatedAt'
  | 'title'
  | 'type'
  | 'position';

export interface CitationSort {
  field: CitationSortField;
  direction: 'asc' | 'desc';
}

/**
 * A CSL style (or locale) fetched from the official repository and cached so
 * the app keeps working offline. Populated in Step 2.
 */
export interface StyleCacheEntry {
  /** Style id (`apa`) or locale id (`locale:en-GB`). */
  id: string;
  kind: 'style' | 'locale';
  title: string;
  /** Raw CSL XML handed to citeproc-js. */
  xml: string;
  /** `id` of the style this one `<link rel="independent-parent">`s to. */
  parentId?: string;
  fetchedAt: Timestamp;
}

/**
 * Cached metadata lookups, keyed by normalised identifier. Lets a repeated
 * paste of the same DOI resolve instantly and keeps us polite to Crossref.
 */
export interface MetadataCacheEntry {
  /** e.g. `doi:10.1038/nature12373`, `url:https://example.com/a` */
  key: string;
  csl: CSLItem;
  resolver: string;
  fetchedAt: Timestamp;
}

/** Singleton-ish key/value bag for app preferences. */
export interface Setting<T = unknown> {
  key: string;
  value: T;
}

/** Lightweight index entry for a style, used by the style picker. */
export interface StyleIndexEntry {
  id: string;
  title: string;
  /** Short label shown in the dropdown, e.g. "APA 7th edition". */
  shortTitle?: string;
  category?: 'in-text' | 'note' | 'numeric' | 'author-date';
  popular?: boolean;
}
