import { fail, notImplemented, param, preflight } from '../_lib/http';

/**
 * GET /api/lookup/url?query=…
 * Returns `LookupResponse`. Resolver logic lands in Step 3.
 */
export default function handler(request: Request): Response {
  if (request.method === 'OPTIONS') return preflight();
  if (!param(request, 'query')) {
    return fail('bad_request', 'Missing required "query" parameter.');
  }
  return notImplemented('/api/lookup/url');
}
