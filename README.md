# OpenCite

A free, unlimited, ad-free citation generator. Paste a URL, DOI or ISBN, get a
correctly formatted reference in any of the ~2,600 styles in the official CSL
repository. Your library lives in your browser — no account, no paywall, no
"upgrade to export".

Built as an open alternative to MyBib and ZoteroBib.

## Status

**Step 1 of 5 — foundation.** The database, the state layer and the build
tooling are in place and tested. The interface arrives in Step 4.

| Step | Scope                                                       | State |
| ---- | ----------------------------------------------------------- | ----- |
| 1    | Architecture, Dexie schema, state management                | done |
| 2    | citeproc-js integration, dynamic `.csl` fetching + caching  | next |
| 3    | Lookup APIs — URL scraping, Crossref, Open Library          | —     |
| 4    | UI — sidebar, citation table, Autocite bar, manual entry    | —     |
| 5    | Export — HTML, `.docx`, BibTeX, RIS                         | —     |

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:api      # serverless functions on :3001 (needs `vercel`)
npm test             # 13 tests across the reducer and the Dexie schema
npm run typecheck
```

Node 20.11+ is required.

## Layout

```
opencite/
├── apps/
│   ├── web/        Vite + React + Tailwind + shadcn/ui — the whole app
│   └── api/        Stateless lookup functions (Web Request/Response)
└── packages/
    └── shared/     CSL-JSON types, entities, API contracts — used by both
```

## Design commitments

**Local-first.** IndexedDB is the source of truth, not a cache of a server.
Nothing leaves the device except the metadata lookups a user explicitly
triggers. That is what makes "free and unlimited" sustainable: there is no
per-user storage cost to recoup.

**CSL-JSON all the way down.** Citations are stored in exactly the shape
citeproc-js consumes, so nothing is transformed on the way to the formatter and
every exporter maps out of one canonical model.

**No store mirroring the database.** Reads go through Dexie's `useLiveQuery`;
React state holds only what is selected and what is typed. A write from any
surface — a paste, an import, a second browser tab — updates every view with no
synchronisation code.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full blueprint.

## Licence

MIT. CSL styles and locales are CC BY-SA 3.0, fetched from the
[citation-style-language](https://github.com/citation-style-language) repos.
