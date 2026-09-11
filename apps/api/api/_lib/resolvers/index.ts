import type { LookupResponse, LookupResult } from '@opencite/shared';
import {
  arxivToDOI,
  identify,
  resolveCrossrefDOI,
  resolveDataCiteDOI,
  resolveGoogleBooksISBN,
  resolveOpenLibraryISBN,
  searchCrossref,
  type Identifier,
} from '@opencite/shared';
import { fetchJSON } from '../http';
import { fetchPage, PageFetchError } from '../fetchPage';
import { resolveWebpage } from './webpage';

export { PageFetchError };

/**
 * Routes an identifier to the services that can answer for it.
 *
 * Resolvers run in order of authority and stop at the first real answer,
 * rather than in parallel: a Crossref record and a Google Books guess are not
 * two opinions to weigh, one is simply better. Racing them would also mean
 * sending every lookup to every service, which is rude to free APIs that ask
 * nothing of us but restraint.
 */

export async function resolveDOI(doi: string): Promise<LookupResult[]> {
  // Crossref for journal literature, DataCite for datasets, preprints,
  // software and theses. A DOI lives in exactly one of them.
  const result =
    (await resolveCrossrefDOI(doi, fetchJSON)) ?? (await resolveDataCiteDOI(doi, fetchJSON));
  return result ? [result] : [];
}

export async function resolveISBN(isbn: string): Promise<LookupResult[]> {
  const result =
    (await resolveOpenLibraryISBN(isbn, fetchJSON)) ??
    (await resolveGoogleBooksISBN(isbn, fetchJSON, {
      ...(process.env.GOOGLE_BOOKS_API_KEY
        ? { googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY }
        : {}),
    }));
  return result ? [result] : [];
}

export async function resolveURL(url: string, key: string): Promise<LookupResult[]> {
  const page = await fetchPage(url);
  return resolveWebpage(page.html, page.finalUrl, key);
}

/** Human-readable "nothing found", per identifier kind. */
function emptyMessage(identifier: Identifier): string {
  switch (identifier.kind) {
    case 'doi':
      return 'No record was found for that DOI. Check it for a typo, or add the reference by hand.';
    case 'isbn':
      return 'No book was found for that ISBN. Check it for a typo, or add the reference by hand.';
    case 'arxiv':
      return 'No record was found for that arXiv id.';
    case 'url':
      return 'That page did not publish enough information to cite. You can add the details by hand.';
    case 'pmid':
      return 'PubMed ids are not supported yet. Try the DOI instead.';
    default:
      return 'That does not look like a URL, DOI or ISBN. You can add the reference by hand.';
  }
}

/**
 * The one entry point the Autocite bar calls. Works out what was pasted and
 * hands it to the right resolver; falls back to a Crossref title search when
 * the input is not an identifier at all.
 */
export async function lookup(query: string): Promise<LookupResponse> {
  const identifier = identify(query);

  let results: LookupResult[] = [];

  switch (identifier.kind) {
    case 'doi':
      results = await resolveDOI(identifier.value);
      break;

    case 'arxiv':
      // arXiv mints a DOI for every paper, so it resolves like any other.
      results = (await resolveDOI(arxivToDOI(identifier.value))).map((result) => ({
        ...result,
        key: identifier.key,
      }));
      break;

    case 'isbn':
      results = await resolveISBN(identifier.value);
      break;

    case 'url':
      results = await resolveURL(identifier.value, identifier.key);
      break;

    case 'pmid':
      results = [];
      break;

    default:
      // Not an identifier — treat it as a title and offer candidates.
      results = query.trim().length >= 4 ? await searchCrossref(query, fetchJSON) : [];
  }

  return results.length > 0 ? { results } : { results: [], message: emptyMessage(identifier) };
}
