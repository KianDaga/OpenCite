import { fail, ok, param, preflight } from '../_lib/http';
import { PageFetchError, lookup } from '../_lib/resolvers';

/**
 * GET /api/lookup?query=…
 *
 * The single endpoint the Autocite bar calls. Works out whether the input is a
 * DOI, ISBN, arXiv id or URL and answers with CSL-JSON.
 *
 * "Found nothing" is a 200 with an empty `results` array and a message: an
 * unknown DOI is a normal outcome, not a server failure, and a client should
 * only treat non-2xx as something being broken.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();

  const query = param(request, 'query');
  if (!query) return fail('bad_request', 'Missing required "query" parameter.');
  if (query.length > 2000) return fail('bad_request', 'That query is too long.');

  try {
    return ok(await lookup(query));
  } catch (error) {
    if (error instanceof PageFetchError) {
      const status = error.code === 'blocked_url' ? 400 : error.code === 'not_found' ? 404 : 502;
      return fail(error.code === 'unsupported_type' ? 'bad_request' : error.code, error.message, status);
    }
    return fail('internal', 'The lookup failed unexpectedly. Please try again.', 500);
  }
}
