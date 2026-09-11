# @opencite/api

Stateless lookup functions. They exist for two reasons: a browser cannot call
Crossref, Open Library or an arbitrary web page directly without hitting CORS,
and scraping needs a real HTML parser.

Nothing here stores user data. A request carries an identifier, the function
returns CSL-JSON, and the only persistence is the edge cache and the caller's
own browser. There are no accounts and no record of what anyone cited.

Handlers are plain `(Request) => Response` functions, so they run unchanged on
Vercel, Netlify, Cloudflare Workers, a plain Node server — or inside the Vite
dev server, which is how `npm run dev` serves them locally with no second
process.

## Routes

| Route                  | Resolvers, in order                                  |
| ---------------------- | ---------------------------------------------------- |
| `GET /api/health`      | —                                                    |
| `GET /api/lookup`      | sniffs the identifier and delegates                  |
| `GET /api/lookup/doi`  | Crossref → DataCite                                  |
| `GET /api/lookup/isbn` | Open Library → Google Books                          |
| `GET /api/lookup/url`  | Highwire → JSON-LD → Dublin Core → OG → metascraper  |

All of them answer `{ results: LookupResult[], message?: string }`. "Found
nothing" is a **200 with an empty array**, not an error status: an unknown DOI
is a normal outcome, and a client should only treat non-2xx as something being
broken.

## Notes on the resolver order

**Crossref before DataCite.** Crossref registers journal literature; DataCite
registers datasets, preprints, software and theses. A DOI lives in exactly one
of them, so this is a fallback chain rather than a race.

**Open Library before Google Books.** Unauthenticated Google Books requests
share a daily quota per calling address and begin failing with HTTP 429 — not a
foundation for a service that promises to be unlimited. Set
`GOOGLE_BOOKS_API_KEY` for a quota of your own.

**Registries before pages.** If a scraped page names a DOI, the page is
abandoned in favour of the registry record: scraped metadata is a guess, a
Crossref record is the publisher's own deposit.

## Safety

`/api/lookup/url` fetches an address chosen by the caller, from inside your
infrastructure. Before each request — and again on every redirect hop, because
a public host can redirect to a private one — the URL is checked: http(s) only,
no embedded credentials, no internal hostnames, and no address in any private,
loopback, link-local or carrier-grade-NAT range. `169.254.169.254` is the one
worth naming: on most cloud providers it serves instance credentials.

Responses are capped while streaming (3 MB) rather than after, and non-HTML
content types are refused outright.
