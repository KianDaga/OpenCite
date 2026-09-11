import { fail, notImplemented, param, preflight } from '../_lib/http';

/**
 * GET /api/lookup?query=…
 *
 * The one endpoint the Autocite bar calls. Step 3 sniffs whether the input is
 * a DOI, ISBN, PMID, arXiv id or URL and delegates to the matching resolver,
 * so the frontend never has to guess what the user pasted.
 */
export default function handler(request: Request): Response {
  if (request.method === 'OPTIONS') return preflight();
  if (!param(request, 'query')) {
    return fail('bad_request', 'Missing required "query" parameter.');
  }
  return notImplemented('/api/lookup');
}
