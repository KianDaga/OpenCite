import { fail, ok, param, preflight } from '../_lib/http';
import { identify } from '@opencite/shared';
import { resolveISBN } from '../_lib/resolvers';

/** GET /api/lookup/isbn?query=9780226025988 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();

  const query = param(request, 'query');
  if (!query) return fail('bad_request', 'Missing required "query" parameter.');

  const identifier = identify(query);
  if (identifier.kind !== 'isbn') {
    // The checksum is what failed, and saying so is more useful than "invalid".
    return fail(
      'bad_request',
      'That is not a valid ISBN — the check digit does not match. Look for a typo.',
    );
  }

  try {
    const results = await resolveISBN(identifier.value);
    return ok(
      results.length > 0
        ? { results }
        : { results: [], message: 'No book was found for that ISBN.' },
    );
  } catch {
    return fail('upstream_error', 'The book catalogues could not be reached.', 502);
  }
}
