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
│   ── added in later steps ──
│       ├── citation/               Step 2: engine.ts, styleRegistry.ts
│       ├── components/             Step 4: Sidebar, CitationTable, …
│       └── export/                 Step 5: docx.ts, bibtex.ts, ris.ts
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

## 5. What the later steps plug into

Each remaining step attaches to a seam that already exists.

**Step 2 — citeproc.** `styles` table is the cache; `StyleCacheEntry.parentId`
already models `<link rel="independent-parent">` for dependent styles.
`citation/engine.ts` implements citeproc's `sys` object with
`retrieveItem` reading from `citations` and `retrieveLocale` from `styles`.
Rendered output gets the `.csl-entry` rules already in `globals.css`.

**Step 3 — lookups.** `LookupResponse` is fixed, the routes answer 501, and
`CitationSource.key` is already the `metadataCache` primary key. Duplicate
detection (`findBySourceKey`) is written and waiting.

**Step 4 — UI.** `useFolderTree()` returns the sidebar tree with rolled-up
counts; `useCitations()` returns the table rows; `DialogState` enumerates every
modal. Drag-and-drop calls `moveCitations({beforeId, afterId})` against the
fractional `position` field, which rewrites one row per move.

**Step 5 — export.** Everything maps out of `Citation.csl`, so each exporter is
a pure function of CSL-JSON with no database access.
