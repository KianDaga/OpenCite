# OpenCite — architecture blueprint

## 1. Shape of the system

OpenCite is a local-first single-page app with a thin, stateless backend.

```
┌─────────────────────────── browser ───────────────────────────┐
│                                                               │
│   React components                                            │
│        │ useLiveQuery (read)      useLibraryActions (write)   │
│        ▼                                   │                  │
│   query fns ──────────► Dexie / IndexedDB ◄┘ repositories      │
│                              │                                │
│                              ├─ projects, folders, citations  │
│                              ├─ styles      (CSL XML cache)   │
│                              └─ metadataCache (lookup cache)  │
│                                                               │
│   citeproc-js ◄── CSL XML + CSL-JSON ──► rendered bibliography │
└───────────────────────────────┬───────────────────────────────┘
                                │ only on explicit lookup
                    ┌───────────▼────────────┐
                    │  /api/lookup/{url,doi, │
                    │   isbn}  — stateless   │
                    └───────────┬────────────┘
                   Crossref · Open Library · Metascraper
```

The backend exists for exactly two reasons: CORS (a browser cannot call
Crossref or fetch an arbitrary page directly) and HTML parsing. It stores
nothing. Delete it and the app still opens, still formats, still exports —
only auto-fetch stops working.

## 2. Directory structure

```
opencite/
├── package.json                    npm workspaces root
├── docs/ARCHITECTURE.md
│
├── packages/shared/                # shared by frontend and backend
│   └── src/
│       ├── csl.ts                  CSL-JSON types (csl-data.json schema)
│       ├── entities.ts             Project, Folder, Citation, caches
│       └── api.ts                  lookup request/response contracts
│
├── apps/web/
│   ├── vite.config.ts              aliases, dev proxy, citeproc chunk split
│   ├── tailwind.config.ts          shadcn token wiring
│   ├── components.json             shadcn CLI config
│   └── src/
│       ├── main.tsx                mounts <LibraryProvider><App/>
│       ├── App.tsx                 shell (real layout lands in Step 4)
│       ├── db/
│       │   ├── dexieStore.ts       schema, indexes, open/reset
│       │   └── repositories/
│       │       ├── projects.ts     create, trash, restore, duplicate
│       │       ├── folders.ts      nesting, moves, cascade deletes
│       │       ├── citations.ts    CRUD, moves, bulk ops, trash
│       │       ├── queries.ts      read-side: search, tree, counts
│       │       └── settings.ts     key/value preferences
│       ├── state/
│       │   ├── types.ts            LibraryUIState + action union
│       │   ├── libraryReducer.ts   pure view-state transitions
│       │   ├── LibraryContext.tsx  provider, bootstrap, actions, undo
│       │   └── hooks.ts            useCitations, useFolderTree, …
│       ├── lib/
│       │   ├── derive.ts           CSL → indexed columns
│       │   ├── ordering.ts         fractional positions for drag-and-drop
│       │   └── id.ts               UUID v4
│       ├── styles/globals.css      design tokens + .csl-entry rules
│       └── test/                   reducer + schema tests
│
│       ├── components/
│       │   ├── layout/AppShell.tsx     shell, tabs, ⌘Z, phone drawer
│       │   ├── sidebar/Sidebar.tsx     projects, folder tree, drop targets
│       │   ├── table/CitationTable.tsx the working list
│       │   ├── table/Toolbar.tsx       search, filters, sort, bulk actions
│       │   ├── table/TrashView.tsx     restore or empty
│       │   ├── dialogs/ManualEntryDialog.tsx
│       │   ├── dialogs/StylePickerDialog.tsx
│       │   ├── dialogs/fields.tsx      name and date editors
│       │   └── ui/                     button, input, dialog, menu, toaster
│       ├── lookup/
│       │   ├── client.ts           API calls + metadataCache
│       │   └── useLookup.ts        Autocite state machine
│       ├── citation/
│       │   ├── cslSource.ts        candidate URLs + response validation
│       │   ├── styleRegistry.ts    fetch, follow parents, two-tier cache
│       │   ├── engine.ts           citeproc adapter, engine cache
│       │   ├── styleCatalog.ts     the verified shortlist for the picker
│       │   └── useBibliography.ts  async render, generation-guarded
│       ├── components/Bibliography.tsx
│       └── scripts/fetch-styles.mjs   vendor styles for offline use
│
│   ── added in Step 5 ──
│       └── export/                 docx.ts, bibtex.ts, ris.ts
│
└── apps/api/
    └── api/
        ├── _lib/http.ts            json/cors/error helpers
        ├── health.ts
        └── lookup/{index,url,doi,isbn}.ts
```

## 3. Database schema

Dexie v1, database `opencite`. `&id` is the primary key, `[a+b]` a compound
index, `*tags` a multi-entry index.

| Table           | Key      | Indexes                                                                                                                              |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`      | `id`     | `name`, `position`, `updatedAt`, `createdAt`, `trashed`, `[trashed+position]`                                                          |
| `folders`       | `id`     | `projectId`, `parentId`, `name`, `position`, `trashed`, `[projectId+trashed]`, `[projectId+parentId]`, `[projectId+parentId+position]` |
| `citations`     | `id`     | `projectId`, `folderId`, `type`, `sortKey`, `position`, `createdAt`, `updatedAt`, `favorite`, `trashed`, `*tags`, `*keywords`, `[projectId+trashed]`, `[projectId+folderId]`, `[projectId+trashed+sortKey]`, `[projectId+trashed+createdAt]`, `[projectId+folderId+trashed]` |
| `styles`        | `id`     | `kind`, `title`, `fetchedAt` — CSL XML cache, so the app formats offline                                                              |
| `metadataCache` | `key`    | `resolver`, `fetchedAt` — a re-pasted DOI resolves instantly                                                                          |
| `settings`      | `key`    | —                                                                                                                                     |

### Three decisions worth explaining

**`csl` is the payload; everything beside it is bookkeeping.** A `Citation` row
holds a `csl` object in exact CSL-JSON form — the thing citeproc-js is handed
verbatim — plus OpenCite's own fields (folder, tags, notes, position, source
provenance). `csl.id` always equals `Citation.id`, so registry lookups are 1:1.

**Derived columns exist because IndexedDB cannot index into a nested object,
and cannot do substring search at all.** So every write projects the queryable
parts of `csl` onto flat columns: `type`, `sortKey` (`"lastname year title"`),
`searchBlob` (lowercased text of every searchable field) and `keywords` (the
blob tokenised, multi-entry indexed for prefix search). `deriveCitationIndexes()`
in `lib/derive.ts` is the only thing that writes them, and every repository
mutation calls it — so the projections cannot drift from the metadata they
describe. There is a test for exactly that.

**Absence of a parent is `ROOT` (`''`), not `null`.** IndexedDB rejects `null`
as a key: a row storing `parentId: null` is simply *absent* from the `parentId`
index, so `where({parentId: null})` returns nothing and every root-level folder
would vanish from the sidebar — silently, with no error anywhere. An empty
string is a valid key, so `ROOT` keeps root folders and unfiled citations
queryable through the same compound indexes as everything else.

**Deletes are soft.** `trashed` is `0`/`1` (IndexedDB cannot index booleans)
with a `deletedAt` timestamp. Undo is a flag flip, cascades are one
`.modify()`, and "empty trash" is the only operation that destroys data.

## 4. State management

The rule: **persisted data is never copied into React state.**

| Concern                        | Lives in                            |
| ------------------------------ | ----------------------------------- |
| Rows (projects, folders, refs) | Dexie — read via `useLiveQuery`     |
| Selection, search, dialogs     | `LibraryUIState` via `useReducer`   |
| Mutations                      | Repository functions                |
| Undo stack                     | A ref in the provider               |

Dexie tracks which tables and key ranges a query touched and re-runs only the
queries a write could have affected — including across browser tabs. So there
is no store to keep in sync, no cache invalidation, and no way for the table
and the sidebar to disagree about what exists.

### Two contexts, on purpose

```tsx
<LibraryStateContext.Provider value={state}>     {/* changes per keystroke */}
  <LibraryActionsContext.Provider value={actions}> {/* built once, never changes */}
```

Every id an action needs is mirrored into a ref, so the actions object is
built once with `useMemo(..., [])`-stable identity. A toolbar button or a
context menu subscribes to the actions half alone and does not re-render while
the user types in the search box.

### The three layers

```
components ──► useLibraryActions()  ──► repositories ──► Dexie
     ▲                                                     │
     └──────── useLiveQuery(query fns) ◄───────────────────┘
```

- **Repositories** (`db/repositories/*`) are plain async functions, transaction-
  wrapped, framework-free — directly unit-testable, and reusable by a future
  CLI or extension.
- **Actions** (`LibraryActions`) wrap repositories with the UI concerns:
  duplicate detection on add, selection cleanup after delete, pushing an undo
  entry, following a newly created project.
- **Hooks** (`state/hooks.ts`) are the read API: `useCitations()`,
  `useFolderTree()`, `useSelectedCitations()`, `useProjectTags()`, `useTrash()`.

### Invariants the reducer enforces

- Switching projects clears every filter scoped to the old one.
- Changing a filter clears the selection — otherwise a bulk action could touch
  rows that scrolled out of view.
- Shift-click ranges are computed against the ids *as displayed*, so a range
  follows the visible sort order rather than insertion order.

## 5. The citation layer

### Everything must be in memory before citeproc starts

citeproc's two host callbacks — `retrieveItem` and `retrieveLocale` — are
**synchronous**. It asks for an item or a locale in the middle of rendering and
cannot wait for a promise. That single fact decides the shape of the whole
layer: an async *preparation* phase resolves the style, follows any parent
link, and loads every locale that could be requested; only once all of it sits
in memory is the engine constructed and rendering run synchronously.

Preloading covers the requested locale, the style's own `default-locale`, and
`en-US`. Anything unpredicted falls back to `en-US` inside `sys` rather than
returning nothing, because returning nothing fails deep inside citeproc's
parser with an error that names no cause.

### Dependent styles

Roughly two-thirds of the CSL repository is *dependent* styles — files whose
entire content is a pointer at another style's rules. Hand one to citeproc and
you get a style with no formatting at all. `resolveStyle()` follows
`<link rel="independent-parent">` (depth-capped, cycle-guarded) and renders
with the parent's XML while keeping the requested id and title for display:
the user picked "Turabian", and that is what they should keep seeing.

They also live at a different path. Independent styles sit at the repository
root, dependent ones under `dependent/`, and the id alone does not say which —
so both are candidates, tried in order.

### Validating the response, not just the status

A candidate URL returning HTTP 200 is not proof it returned a style. Static
hosting answers *any* unmatched path with `index.html`, so a request for a
style that is not self-hosted comes back as the app's own HTML page — which
then reaches citeproc as a "style". Every response is therefore checked for the
CSL namespace and the expected root element before it is accepted. The same
guard covers captive portals and CDN error pages.

### Caching, in two tiers

A module-level `Map` in front of the `styles` table in IndexedDB. Cached
entries are served immediately however old they are and revalidated in the
background past 30 days — a style that formats slightly out of date beats a
spinner, and CSL styles change rarely. Engines are cached too, keyed by
style + locale and capped at four, because constructing one parses ~85 KB of
XML; renders re-point an existing engine at fresh items instead of rebuilding.

Once a style has been seen, it formats offline. Verified by reloading with
every CSL request blocked.

### Layout comes from the style

APA hangs its entries; IEEE puts `[1]` in a flush-left gutter sized to the
widest label. citeproc reports which in its bibliography metadata
(`hangingindent`, `second-field-align`, `maxoffset`), and that is projected
onto the container as data attributes and custom properties which
`globals.css` reads. Hard-coding either layout silently mis-renders every
style of the other kind — which is exactly what Step 1's stylesheet did, and
what the numeric-layout test now guards.

### citeproc is loaded lazily

The library is ~376 KB minified. A dynamic `import()` keeps it in its own
chunk, so nothing is downloaded until there is something to format.

## 6. The lookup layer

### One box, and the server works out what was in it

`identify()` lives in `packages/shared` precisely so both sides use the same
function: the browser needs it to compute a cache key *before* deciding whether
to make a request, and the server needs it to route. Two copies of that logic
would drift, and the symptom would be a cache that silently never hits.

Order matters. A DOI found anywhere in the input wins — including inside a
`doi.org` or publisher URL — because scraping a landing page when the registry
record is one request away gives worse metadata for more work. ISBNs are
accepted only when the **check digit validates**: plenty of thirteen-digit
numbers are not ISBNs, and looking one up returns a confidently wrong book
rather than an honest "not found". arXiv ids resolve through the DOI arXiv
mints for every paper (`10.48550/arXiv.*`), so they need no parser of their own.

### Resolver order is authority, not a race

| Kind | Order                                                        |
| ---- | ------------------------------------------------------------ |
| DOI  | Crossref → DataCite                                           |
| ISBN | Open Library → Google Books                                   |
| URL  | Highwire `citation_*` → JSON-LD → Dublin Core → OG → metascraper |

Resolvers run in sequence and stop at the first real answer. A Crossref record
and a Google Books guess are not two opinions to weigh — one is simply better.
Racing them would also send every lookup to every service, which is a poor way
to treat free APIs.

Open Library is primary for ISBNs because unauthenticated Google Books requests
share a per-address daily quota and start returning HTTP 429. That is not a
foundation for a service that promises to be unlimited.

### Scraping: metascraper is the floor, not the ceiling

Metascraper is very good at "what is this article and who wrote it", which is
why it handles the fallback layer. But it is built for content, not citations:
it has no notion of a journal name, a volume, an issue or a DOI. Publishers do
expose exactly that, through the Highwire Press `citation_*` tags that Google
Scholar reads, plus Dublin Core and schema.org — so those are read first and
metascraper fills the gaps.

And if the page names a DOI, the page is abandoned in favour of the registry.

Two things that look like paranoia and are not:

- **Placeholder authors are filtered.** citationstyles.org ships
  `<meta name="author" content="Your Name">` — the unedited Jekyll default.
  Without the filter, every citation of that page credits a person called Your
  Name.
- **A site name equal to the title is dropped.** Many sites set `og:site_name`
  to the same string as `og:title`, and printing both reads as a mistake in
  every style.

### The URL endpoint is the dangerous one

It fetches an address chosen by the caller, from inside our infrastructure.
Unguarded that is server-side request forgery: `http://169.254.169.254/` serves
cloud instance credentials, `http://localhost:6379/` reaches a Redis on the same
host, `file://` reads the disk.

So the scheme is restricted to http(s), embedded credentials are refused,
internal hostnames are blocked, the hostname is resolved and every resulting
address is checked against the private, loopback, link-local, CGNAT and
multicast ranges — and redirects are followed **by hand** so each hop is checked
again, because a public hostname is free to redirect to a private one. Bodies
are capped while streaming rather than after, since `response.text()` on a huge
file exhausts the function's memory before any length check could run.

### Duplicates are matched on identifiers, not just source keys

A DOI pasted directly and the publisher's page for the same paper normalise to
different cache keys, so the same work landed twice and the bibliography
disambiguated them into "2013a" and "2013b" — which reads as two different
papers. Published identifiers (DOI, ISBN) are now checked as well, since a DOI
is the same work however the reader arrived at it.

## 7. The interface

### Two views of one list

References and Bibliography are tabs, not panes. They are the same data
answering different questions — "what do I have" versus "what does it look
like" — and their sort orders legitimately differ: the table follows whatever
the reader chose, the bibliography follows what the style demands. A split view
would halve both to show the same rows twice.

Which view is open lives in the reducer rather than in component state,
because the sidebar needs to reach it: clicking Trash switches the main pane.
Picking a project or folder while in the trash returns to the reference list,
since the trash is global and staying there would ignore the click.

### The manual-entry form follows the type

CSL has roughly eighty variables, and most are meaningless for any given type —
a book has no issue number. So `lib/cslFields.ts` maps each type to the fields
its styles actually read, and everything else stays under "More fields".
Changing the type re-shapes the form but keeps what was already typed.

Two field kinds get real editors rather than text boxes, because they are where
hand-entered references go wrong:

- **Names** are family/given, or a single `literal` for an organisation. A
  toggle switches between them, because "World Health Organization" split into
  a first and last name gets initialised into nonsense by every style.
- **Dates** keep the precision they were given. `1998` stays `1998`; filling in
  1 January would put a date in the citation that the source never claimed.

### Rendering in-text labels needs the whole list

citeproc assigns `citation-number` from the items currently registered, so a
reference rendered on its own is always "[1]". The table therefore renders
labels for every visible row in one pass — which is also what gives author-date
styles their real disambiguation.

The same distinction applies to names: the search index stores "Arendt Hannah"
so that typing either half matches, and showing that string to a reader is
simply the name backwards. Display uses a separate formatter.

### Deletes, drags and undo

Folders are drop targets and rows are draggable, which is the fastest way to
file a pile of references. Dragging an unselected row moves that row; dragging
a selected one moves the whole selection.

Every delete raises a toast with an Undo, and ⌘Z works anywhere outside a text
field — inside one it belongs to the field. Both are nearly free because
deletes are soft: undo is a flag flip, not a restore from a history buffer.

### Below `md` the sidebar becomes a drawer

Hiding it entirely, as the first pass did, left no way to reach projects,
folders or the trash on a phone. It opens from the header and closes as soon as
a destination is chosen.

## 8. What the last step plugs into

Each remaining step attaches to a seam that already exists.

**Step 4 — UI.** `useFolderTree()` returns the sidebar tree with rolled-up
counts; `useCitations()` returns the table rows; `DialogState` enumerates every
modal. Drag-and-drop calls `moveCitations({beforeId, afterId})` against the
fractional `position` field, which rewrites one row per move.

**Step 5 — export.** Everything maps out of `Citation.csl`, so each exporter is
a pure function of CSL-JSON with no database access.
