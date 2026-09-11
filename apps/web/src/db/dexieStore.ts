import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  Citation,
  Folder,
  MetadataCacheEntry,
  Project,
  Setting,
  StyleCacheEntry,
} from '@opencite/shared';

/**
 * OpenCite's local database.
 *
 * The whole app is local-first: IndexedDB is the source of truth, not a cache
 * of some server. There is no login and nothing leaves the device except the
 * metadata lookups the user explicitly triggers. Every read in the UI goes
 * through `useLiveQuery`, so a write here re-renders whatever is showing it —
 * which is why no React state ever mirrors these tables.
 *
 * ── Index notes ───────────────────────────────────────────────────────────
 * `&id`      primary key (client-generated UUID)
 * `[a+b]`    compound index — required for the project+folder listing queries
 * `*tags`    multi-entry index — one entry per array element
 * `trashed`  soft-delete flag stored as 0/1 because IndexedDB cannot index
 *            booleans. Everything the user sees filters on `trashed = 0`;
 *            the Trash view filters on `1`. Nothing is ever hard-deleted
 *            except by emptying the trash, so "undo delete" is a flag flip.
 */
export class OpenCiteDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  folders!: EntityTable<Folder, 'id'>;
  citations!: EntityTable<Citation, 'id'>;
  styles!: EntityTable<StyleCacheEntry, 'id'>;
  metadataCache!: EntityTable<MetadataCacheEntry, 'key'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'opencite') {
    super(name);

    this.version(1).stores({
      projects: '&id, name, position, updatedAt, createdAt, trashed, [trashed+position]',

      folders:
        '&id, projectId, parentId, name, position, trashed, ' +
        '[projectId+trashed], [projectId+parentId], [projectId+parentId+position]',

      citations:
        '&id, projectId, folderId, type, sortKey, position, createdAt, updatedAt, ' +
        'favorite, trashed, *tags, *keywords, ' +
        '[projectId+trashed], [projectId+folderId], [projectId+trashed+sortKey], ' +
        '[projectId+trashed+createdAt], [projectId+folderId+trashed]',

      styles: '&id, kind, title, fetchedAt',

      metadataCache: '&key, resolver, fetchedAt',

      settings: '&key',
    });

    // Timestamps are maintained centrally so no repository can forget them.
    // `EntityTable` narrows away the CRUD hook overloads, so reach for the
    // underlying `Table` view to register them.
    const timestamped = [this.projects, this.folders, this.citations] as unknown as Array<
      Table<Record<string, unknown>, string>
    >;
    for (const table of timestamped) {
      table.hook('creating', (_pk, obj: Record<string, unknown>) => {
        const ts = Date.now();
        obj.createdAt ??= ts;
        obj.updatedAt ??= ts;
      });
      // Dexie types the modifications bag as `Object`, so the parameter has to
      // be at least that wide for the overload to match.
      table.hook('updating', (mods: object) => {
        // A caller that set `updatedAt` itself already carries intent;
        // otherwise stamp the edit.
        if ('updatedAt' in mods) return mods;
        return { ...mods, updatedAt: Date.now() };
      });
    }
  }
}

export const db = new OpenCiteDB();

/**
 * Opens the database and reports why it failed when it does. The two realistic
 * failures are a private-browsing context that denies IndexedDB, and a schema
 * downgrade (the user opened an older deploy after a migration). Both need a
 * clear message rather than a blank screen — the UI surfaces this in
 * `DatabaseGate`.
 */
export type DbStatus =
  | { state: 'ready' }
  | { state: 'blocked'; reason: 'unsupported' | 'denied' | 'version-mismatch'; error?: Error };

export async function openDatabase(): Promise<DbStatus> {
  if (typeof indexedDB === 'undefined') {
    return { state: 'blocked', reason: 'unsupported' };
  }
  try {
    await db.open();
    return { state: 'ready' };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'VersionError') {
      return { state: 'blocked', reason: 'version-mismatch', error: err };
    }
    return { state: 'blocked', reason: 'denied', error: err };
  }
}

/** Wipes everything. Used by "Delete all my data" and by tests. */
export async function resetDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.folders, db.citations, db.metadataCache, db.settings],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.folders.clear(),
        db.citations.clear(),
        db.metadataCache.clear(),
        db.settings.clear(),
      ]);
    },
  );
  // `styles` is a pure network cache — keeping it saves re-downloading CSL XML.
}
