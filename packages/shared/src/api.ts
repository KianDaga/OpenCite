import type { CSLItem } from './csl';

/**
 * Wire contract between the React app and the serverless lookup functions.
 * Implemented in Step 3; declared here so the frontend can be written against
 * a stable shape and so both sides typecheck from one definition.
 *
 * Every endpoint returns `LookupResponse` and always answers with HTTP 200 for
 * "resolved nothing" — a network-level error means the service failed, not that
 * the identifier was unknown.
 */

export type ResolverName =
  | 'crossref'
  | 'datacite'
  | 'openlibrary'
  | 'google-books'
  | 'metascraper'
  | 'pubmed'
  | 'arxiv'
  | 'cache';

export interface LookupRequest {
  /** A URL, DOI, ISBN, PMID or arXiv id. The server sniffs the type. */
  query: string;
}

export interface LookupResult {
  /** CSL-JSON ready to drop straight into a `Citation`. */
  csl: CSLItem;
  resolver: ResolverName;
  /** Normalised cache key, e.g. `doi:10.1038/nature12373`. */
  key: string;
  /** 0–1 confidence; the UI can prompt for confirmation below ~0.6. */
  confidence: number;
}

export interface LookupResponse {
  results: LookupResult[];
  /** Present when nothing resolved, for a human-readable explanation. */
  message?: string;
}

export interface ApiError {
  error: {
    code:
      | 'bad_request'
      | 'not_found'
      | 'rate_limited'
      | 'upstream_error'
      | 'blocked_url'
      | 'timeout'
      | 'internal';
    message: string;
  };
}

/** Paths are relative to `VITE_API_BASE_URL`. */
export const API_ROUTES = {
  health: '/api/health',
  lookupAuto: '/api/lookup',
  lookupUrl: '/api/lookup/url',
  lookupDoi: '/api/lookup/doi',
  lookupIsbn: '/api/lookup/isbn',
  searchStyles: '/api/styles/search',
} as const;
