import { ROOT, type Citation, type CitationSort, type Folder, type FolderRef } from '@opencite/shared';
import { db } from '../dexieStore';
import { tokenize } from '@/lib/derive';

/**
 * Read-side queries. Kept separate from the mutating repositories because
 * these are what `useLiveQuery` subscribes to — Dexie re-runs the whole
 * function whenever a table it touched changes, so they must stay cheap and
 * free of side effects.
 */

export function liveProjects() {
  return db.projects.where({ trashed: 0 }).sortBy('position');
}

export function liveFolders(projectId: string | undefined): Promise<Folder[]> {
  if (!projectId) return Promise.resolve([]);
  return db.folders.where({ projectId, trashed: 0 }).sortBy('position');
}

export interface FolderNode extends Folder {
  children: FolderNode[];
  /** Citations in this folder and everything under it. */
  count: number;
}

/** Builds the sidebar tree in one pass, with rolled-up counts. */
export function buildFolderTree(folders: Folder[], counts: Map<FolderRef, number>): FolderNode[] {
  const nodes = new Map<string, FolderNode>(
    folders.map((f) => [f.id, { ...f, children: [], count: counts.get(f.id) ?? 0 }]),
  );
  const roots: FolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentId === ROOT ? undefined : nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortAndRollUp = (list: FolderNode[]): number => {
    list.sort((a, b) => a.position - b.position);
    let total = 0;
    for (const node of list) {
      node.count += sortAndRollUp(node.children);
      total += node.count;
    }
    return total;
  };
  sortAndRollUp(roots);

  return roots;
}

export interface CitationQuery {
  projectId: string | undefined;
  /** `undefined` = every folder in the project ("All references"). */
  folderId?: FolderRef | undefined;
  search?: string;
  tags?: string[];
  favoritesOnly?: boolean;
  sort?: CitationSort;
}

function compare(a: Citation, b: Citation, sort: CitationSort): number {
  const dir = sort.direction === 'asc' ? 1 : -1;
  switch (sort.field) {
    case 'title':
      return dir * (a.csl.title ?? '').localeCompare(b.csl.title ?? '');
    case 'type':
      return dir * a.type.localeCompare(b.type);
    case 'createdAt':
    case 'updatedAt':
    case 'position':
      return dir * (a[sort.field] - b[sort.field]);
    case 'sortKey':
    default:
      return dir * a.sortKey.localeCompare(b.sortKey);
  }
}

/**
 * The main table query.
 *
 * Search narrows through the multi-entry `keywords` index first (prefix match
 * on each typed token, intersected) rather than scanning every row, then falls
 * back to a substring check on `searchBlob` so a query like "nat geo" still
 * matches mid-word. Sorting happens in memory: a local library is thousands of
 * rows, not millions, and doing it here keeps every sort field available
 * without a dedicated index for each.
 */
export async function queryCitations(q: CitationQuery): Promise<Citation[]> {
  if (!q.projectId) return [];
  const sort = q.sort ?? { field: 'sortKey', direction: 'asc' };

  let rows: Citation[];

  const search = q.search?.trim().toLowerCase() ?? '';
  if (search) {
    const tokens = tokenize(search);
    const sets = await Promise.all(
      tokens.map((token) =>
        db.citations.where('keywords').startsWithIgnoreCase(token).primaryKeys(),
      ),
    );
    let ids = (sets[0] ?? []) as string[];
    for (const set of sets.slice(1)) {
      const next = new Set(set as string[]);
      ids = ids.filter((id) => next.has(id));
    }
    rows = await db.citations.where('id').anyOf(ids).toArray();
    rows = rows.filter(
      (c) =>
        c.projectId === q.projectId &&
        c.trashed === 0 &&
        (tokens.length > 0 || c.searchBlob.includes(search)),
    );
  } else {
    rows = await db.citations.where({ projectId: q.projectId, trashed: 0 }).toArray();
  }

  if (q.folderId !== undefined) rows = rows.filter((c) => c.folderId === q.folderId);
  if (q.favoritesOnly) rows = rows.filter((c) => c.favorite === 1);
  if (q.tags?.length) {
    rows = rows.filter((c) => q.tags!.every((tag) => c.tags.includes(tag)));
  }

  return rows.sort((a, b) => compare(a, b, sort));
}

/** Citation counts per folder, for the sidebar badges. */
export async function citationCounts(projectId: string | undefined): Promise<Map<FolderRef, number>> {
  const counts = new Map<FolderRef, number>();
  if (!projectId) return counts;
  await db.citations.where({ projectId, trashed: 0 }).each((c) => {
    counts.set(c.folderId, (counts.get(c.folderId) ?? 0) + 1);
  });
  return counts;
}

/** Every tag in use in a project, most-used first — powers the tag filter. */
export async function projectTags(projectId: string | undefined): Promise<Array<[string, number]>> {
  if (!projectId) return [];
  const counts = new Map<string, number>();
  await db.citations.where({ projectId, trashed: 0 }).each((c) => {
    for (const tag of c.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export async function trashedCitations(): Promise<Citation[]> {
  return db.citations.where({ trashed: 1 }).reverse().sortBy('deletedAt');
}

/**
 * Finds a reference the project already holds.
 *
 * Matching on the source key alone is not enough: a DOI pasted directly and
 * the publisher's page for the same paper normalise to different keys
 * (`doi:10.1038/…` and `url:https://nature.com/…`), so the paper lands twice
 * and the bibliography disambiguates them into "2013a" and "2013b" — which
 * looks like two papers by the same authors in the same year.
 *
 * So the published identifiers are checked too. A DOI or ISBN is the same work
 * however the reader arrived at it.
 */
export async function findExisting(
  projectId: string,
  candidate: { key?: string; doi?: string; isbn?: string },
): Promise<Citation | undefined> {
  const key = candidate.key;
  const doi = candidate.doi?.toLowerCase();
  const isbn = candidate.isbn?.replace(/[\s-]/g, '');
  if (!key && !doi && !isbn) return undefined;

  return db.citations
    .where({ projectId, trashed: 0 })
    .filter((c) => {
      if (key && c.source.key === key) return true;
      if (doi && typeof c.csl.DOI === 'string' && c.csl.DOI.toLowerCase() === doi) return true;
      if (isbn && typeof c.csl.ISBN === 'string' && c.csl.ISBN.replace(/[\s-]/g, '') === isbn) {
        return true;
      }
      return false;
    })
    .first();
}

/** Back-compat shorthand for a source-key-only check. */
export async function findBySourceKey(
  projectId: string,
  key: string,
): Promise<Citation | undefined> {
  return findExisting(projectId, { key });
}
