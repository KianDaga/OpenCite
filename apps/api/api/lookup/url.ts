import { fail, ok, param, preflight } from '../_lib/http';
import { identify } from '@opencite/shared';
import { PageFetchError, resolveURL } from '../_lib/resolvers';

/** GET /api/lookup/url?query=https://example.com/article */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();

  const query = param(request, 'query');
  if (!query) return fail('bad_request', 'Missing required "query" parameter.');

  const identifier = identify(query);
  if (identifier.kind !== 'url') {
    return fail('bad_request', 'That is not a web address.');
  }

  try {
    const results = await resolveURL(identifier.value, identifier.key);
    return ok(
      results.length > 0
        ? { results }
        : { results: [], message: 'That page did not publish enough information to cite.' },
    );
  } catch (error) {
    if (error instanceof PageFetchError) {
      const status = error.code === 'blocked_url' ? 400 : error.code === 'not_found' ? 404 : 502;
      return fail(
        error.code === 'unsupported_type' ? 'bad_request' : error.code,
        error.message,
        status,
      );
    }
    return fail('internal', 'The lookup failed unexpectedly.', 500);
  }
}
