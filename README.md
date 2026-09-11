# OpenCite

A free, unlimited, ad-free citation generator. Paste a URL, DOI or ISBN, get a
correctly formatted reference in any of the ~2,600 styles in the official CSL
repository. Your library lives in your browser — no account, no paywall, no
"upgrade to export".

Built as an open alternative to MyBib and ZoteroBib.

## Status

**Step 4 of 5 — it is an application.** Projects and folders in a sidebar, a
reference table, one box that cites anything you paste, and a form for
everything with no identifier to look up. Only the export formats are left.

| Step | Scope                                                       | State |
| ---- | ----------------------------------------------------------- | ----- |
| 1    | Architecture, Dexie schema, state management                | done  |
| 2    | citeproc-js integration, dynamic `.csl` fetching + caching  | done  |
| 3    | Lookup APIs — URL scraping, Crossref, Open Library          | done  |
| 4    | UI — sidebar, citation table, Autocite bar, manual entry    | done  |
| 5    | Export — HTML, `.docx`, BibTeX, RIS                         | next  |

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — serves the lookup API too
npm test             # 132 tests across all three workspaces
npm run typecheck
```

The serverless functions run inside the Vite dev server, so there is no second
process and no CORS to configure. Two optional environment variables are worth
setting in production — see `apps/api/.env.example`.

To run without a CDN — offline installs, or networks that block third-party
requests — vendor the styles you ship:

```bash
npm run fetch:styles --workspace @opencite/web          # the default catalog
npm run fetch:styles --workspace @opencite/web apa ieee # or just these
```

They land in `apps/web/public/csl/`, which the app already prefers over the
CDN. Dependent styles pull their parent down too.

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

**Ask once.** Crossref, Open Library and the CSL repository are free services
run for the community. Every lookup is cached in the browser and keyed by a
normalised identifier shared by client and server, so pasting the same DOI
twice — in another project, or a week later — sends no request at all.

**The style decides the layout, not the stylesheet.** APA wants a hanging
indent; IEEE wants a flush-left `[1]` gutter. citeproc reports which in its
bibliography metadata, and the CSS reads that — so adding a style never means
touching code.

**No store mirroring the database.** Reads go through Dexie's `useLiveQuery`;
React state holds only what is selected and what is typed. A write from any
surface — a paste, an import, a second browser tab — updates every view with no
synchronisation code.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full blueprint.

## Licence

MIT. CSL styles and locales are CC BY-SA 3.0, fetched from the
[citation-style-language](https://github.com/citation-style-language) repos.
