import { json, preflight } from './_lib/http';

export default function handler(request: Request): Response {
  if (request.method === 'OPTIONS') return preflight();
  return json({ status: 'ok', service: 'opencite-api', time: new Date().toISOString() });
}
