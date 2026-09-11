import {
  arxivToDOI,
  identify,
  resolveCrossrefDOI,
  resolveDataCiteDOI,
  resolveGoogleBooksISBN,
  resolveOpenLibraryISBN,
  searchCrossref,
  type JSONFetcher,
  type LookupResponse,
  type LookupResult,
} from '@opencite/shared';
import { LookupOffline, UrlLookupUnavailable } from './errors';

/**
 * Autocite without a server.
 *
 * Crossref, Open Library and DataCite all send `Access-Control-Allow-Origin`,
 * which means the browser can query them directly. So DOIs, ISBNs, arXiv ids
 * and title searches — the great majority of what anyone cites — work on a
 * purely static deployment, with no backend to run and nothing in between the
 * reader and the registry.
 *
 * The one thing this cannot do is read a web page. Fetching an arbitrary URL
 * from a browser is blocked by the same-origin policy, and there is no way
 * around that which does not involve sending the reader's browsing through
 * somebody else's proxy. That case is handled by `apps/api` when it is
 * deployed, and reported honestly when it is not.
 *
 * The mapping from each service's JSON to CSL is shared with the server
 * (`packages/shared/src/resolvers`), so both paths produce identical metadata.
 */

/**
 * Browser fetch, with a note of whether anything failed at the network level.
 *
 * A resolver that answers "no such record" and one that could not be reached
 * both return `undefined`, but they mean very different things to the reader:
 * one is a typo, the other is a dropped connection. The flag keeps them
 * distinguishable so an offline lookup is not reported as a missing DOI.
 */
function createFetcher(): { fetchJSON: JSONFetcher; failed: () => boolean } {
  let networkFailure = false;

  const fetchJSON: JSONFetcher = async <T,>(url: string): Promise<T | undefined> => {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      // A 404 is an answer; only a thrown request is a failure to reach.
      if (!response.ok) return undefined;
      return (await response.json()) as T;
    } catch {
      networkFailure = true;
      return undefined;
    }
  };

  return { fetchJSON, failed: () => networkFailure };
}

async function resolveDOI(doi: string, fetchJSON: JSONFetcher): Promise<LookupResult[]> {
  // Crossref holds journal literature, DataCite datasets and preprints.
  const result =
    (await resolveCrossrefDOI(doi, fetchJSON)) ?? (await resolveDataCiteDOI(doi, fetchJSON));
  return result ? [result] : [];
}

async function resolveISBN(isbn: string, fetchJSON: JSONFetcher): Promise<LookupResult[]> {
  const result =
    (await resolveOpenLibraryISBN(isbn, fetchJSON)) ??
    (await resolveGoogleBooksISBN(isbn, fetchJSON));
  return result ? [result] : [];
}

const MESSAGES: Record<string, string> = {
  doi: 'No record was found for that DOI. Check it for a typo, or add the reference by hand.',
  isbn: 'No book was found for that ISBN. Check it for a typo, or add the reference by hand.',
  arxiv: 'No record was found for that arXiv id.',
  pmid: 'PubMed ids are not supported yet. Try the DOI instead.',
  unknown: 'That does not look like a URL, DOI or ISBN. You can add the reference by hand.',
};

/**
 * Resolves everything that can be resolved from the browser.
 *
 * Throws `UrlLookupUnavailable` for a web page, so the caller can offer manual
 * entry with the address already filled in rather than reporting a failure.
 */
export async function lookupDirect(query: string): Promise<LookupResponse> {
  const identifier = identify(query);
  const { fetchJSON, failed } = createFetcher();
  let results: LookupResult[] = [];

  switch (identifier.kind) {
    case 'doi':
      results = await resolveDOI(identifier.value, fetchJSON);
      break;

    case 'arxiv':
      // arXiv mints a DOI for every paper, so no separate API is needed.
      results = (await resolveDOI(arxivToDOI(identifier.value), fetchJSON)).map((result) => ({
        ...result,
        key: identifier.key,
      }));
      break;

    case 'isbn':
      results = await resolveISBN(identifier.value, fetchJSON);
      break;

    case 'url':
      throw new UrlLookupUnavailable(identifier.value);

    case 'pmid':
      results = [];
      break;

    default:
      results = query.trim().length >= 4 ? await searchCrossref(query, fetchJSON) : [];
  }

  // Nothing found *and* nothing reached is an offline problem, not a missing
  // record — saying "no such DOI" would send the reader hunting for a typo.
  if (results.length === 0 && failed()) throw new LookupOffline();

  return results.length > 0
    ? { results }
    : { results: [], message: MESSAGES[identifier.kind] ?? MESSAGES.unknown! };
}
