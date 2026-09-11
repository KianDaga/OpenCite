import { fail, ok, param, preflight } from '../_lib/http';
import { identify } from '@opencite/shared';
import { resolveDOI } from '../_lib/resolvers';

/** GET /api/lookup/doi?query=10.1038/nature12373 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();

  const query = param(request, 'query');
  if (!query) return fail('bad_request', 'Missing required "query" parameter.');

  const identifier = identify(query);
  if (identifier.kind !== 'doi') {
    return fail('bad_request', 'That is not a DOI. A DOI looks like 10.1038/nature12373.');
  }

  try {
    const results = await resolveDOI(identifier.value);
    return ok(
      results.length > 0
        ? { results }
        : { results: [], message: 'No record was found for that DOI.' },
    );
  } catch {
    return fail('upstream_error', 'The DOI registry could not be reached.', 502);
  }
}
