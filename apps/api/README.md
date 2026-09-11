# @opencite/api

Stateless lookup functions. They exist for one reason: a browser cannot call
Crossref, Open Library or an arbitrary web page directly without hitting CORS,
and scraping needs a real HTML parser.

Nothing here stores user data. A request carries an identifier, the function
returns CSL-JSON, and the only persistence is an edge cache keyed by that
identifier. There are no accounts, no logs of what anyone cited.

Handlers are written against the Web `Request`/`Response` API so they run
unchanged on Vercel, Netlify, Cloudflare Workers or a plain Node server.

Implemented in **Step 3**; the routes below currently answer `501`.

| Route               | Source                                  |
| ------------------- | --------------------------------------- |
| `GET /api/health`   | —                                       |
| `GET /api/lookup`   | sniffs the identifier, delegates below  |
| `GET /api/lookup/doi`  | Crossref, then DataCite               |
| `GET /api/lookup/isbn` | Open Library, then Google Books       |
| `GET /api/lookup/url`  | Metascraper (+ embedded citation meta) |
