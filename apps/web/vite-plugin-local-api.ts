import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Runs the serverless functions inside the Vite dev server.
 *
 * The handlers in `apps/api` are plain `(Request) => Response` functions, which
 * is the whole reason they were written that way: they need no platform to
 * run. This plugin maps `/api/*` onto the matching file and loads it through
 * Vite's SSR pipeline, so `npm run dev` gives working lookups with hot reload
 * and no second process, no `vercel` CLI, and no CORS.
 *
 * Production still runs them on whatever platform serves `apps/api`; this is
 * only for local development.
 */

const API_ROOT = path.resolve(import.meta.dirname, '../api/api');

/** `/api/lookup/doi` → `…/api/lookup/doi.ts`, `/api/lookup` → `…/lookup/index.ts`. */
function resolveHandlerFile(pathname: string): string | undefined {
  const relative = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  // Refuse anything that could climb out of the API directory.
  if (relative.includes('..') || path.isAbsolute(relative)) return undefined;

  const base = path.join(API_ROOT, relative || 'index');
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && candidate.startsWith(API_ROOT)) return candidate;
  }
  return undefined;
}

export function localApi(): Plugin {
  return {
    name: 'opencite-local-api',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) return next();

        void (async () => {
          const requestUrl = new URL(url, `http://${req.headers.host ?? 'localhost'}`);
          const file = resolveHandlerFile(requestUrl.pathname);

          if (!file) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: { code: 'not_found', message: `No handler for ${requestUrl.pathname}` } }));
            return;
          }

          try {
            const module = (await server.ssrLoadModule(file)) as {
              default: (request: Request) => Response | Promise<Response>;
            };

            const request = new Request(requestUrl, {
              method: req.method,
              headers: req.headers as Record<string, string>,
            });

            const response = await module.default(request);

            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) {
            server.ssrFixStacktrace(error as Error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: { code: 'internal', message: (error as Error).message },
              }),
            );
          }
        })();
      });
    },
  };
}
