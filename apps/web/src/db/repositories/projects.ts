import { ROOT, type CitationSort, type Project } from '@opencite/shared';
import { db } from '../dexieStore';
import { newId } from '@/lib/id';
import { positionAtEnd } from '@/lib/ordering';

export const DEFAULT_SORT: CitationSort = { field: 'sortKey', direction: 'asc' };

export interface CreateProjectInput {
  name?: string;
  styleId?: string;
  localeId?: string;
  color?: string;
}

export async function createProject(input: CreateProjectInput = {}): Promise<Project> {
  const positions = await db.projects.where({ trashed: 0 }).toArray();
  const project: Project = {
    id: newId(),
    name: input.name?.trim() || 'Untitled project',
    styleId: input.styleId ?? 'apa',
    localeId: input.localeId ?? 'en-US',
    sort: DEFAULT_SORT,
    position: positionAtEnd(positions.map((p) => p.position)),
    ...(input.color ? { color: input.color } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    trashed: 0,
    deletedAt: null,
  };
  await db.projects.add(project);
  return project;
}

export type ProjectPatch = Partial<
  Pick<Project, 'name' | 'styleId' | 'localeId' | 'sort' | 'color' | 'position'>
>;

export async function updateProject(id: string, patch: ProjectPatch): Promise<void> {
  await db.projects.update(id, patch);
}

/**
 * Trashing a project cascades to its folders and citations so the sidebar,
 * the table and the trash view never disagree about what is live.
 */
export async function trashProject(id: string): Promise<void> {
  const deletedAt = Date.now();
  await db.transaction('rw', [db.projects, db.folders, db.citations], async () => {
    await db.projects.update(id, { trashed: 1, deletedAt });
    await db.folders.where({ projectId: id }).modify({ trashed: 1, deletedAt });
    await db.citations.where({ projectId: id }).modify({ trashed: 1, deletedAt });
  });
}

export async function restoreProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.folders, db.citations], async () => {
    await db.projects.update(id, { trashed: 0, deletedAt: null });
    await db.folders.where({ projectId: id }).modify({ trashed: 0, deletedAt: null });
    await db.citations.where({ projectId: id }).modify({ trashed: 0, deletedAt: null });
  });
}

/** Irreversible. Only reachable from "empty trash". */
export async function destroyProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.folders, db.citations], async () => {
    await db.citations.where({ projectId: id }).delete();
    await db.folders.where({ projectId: id }).delete();
    await db.projects.delete(id);
  });
}

export async function duplicateProject(id: string, name?: string): Promise<Project | undefined> {
  return db.transaction('rw', [db.projects, db.folders, db.citations], async () => {
    const source = await db.projects.get(id);
    if (!source) return undefined;

    const copy = await createProject({
      name: name ?? `${source.name} (copy)`,
      styleId: source.styleId,
      localeId: source.localeId,
      ...(source.color ? { color: source.color } : {}),
    });

    // Folder ids change, so remap parent/child links as we go.
    const folders = await db.folders.where({ projectId: id, trashed: 0 }).toArray();
    const idMap = new Map<string, string>(folders.map((f) => [f.id, newId()]));
    await db.folders.bulkAdd(
      folders.map((f) => ({
        ...f,
        id: idMap.get(f.id)!,
        projectId: copy.id,
        parentId: f.parentId ? (idMap.get(f.parentId) ?? ROOT) : ROOT,
      })),
    );

    const citations = await db.citations.where({ projectId: id, trashed: 0 }).toArray();
    await db.citations.bulkAdd(
      citations.map((c) => {
        const cid = newId();
        return {
          ...c,
          id: cid,
          projectId: copy.id,
          folderId: c.folderId ? (idMap.get(c.folderId) ?? ROOT) : ROOT,
          csl: { ...c.csl, id: cid },
        };
      }),
    );

    return copy;
  });
}
