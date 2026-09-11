import { ROOT, type Folder, type FolderRef } from '@opencite/shared';
import { db } from '../dexieStore';
import { newId } from '@/lib/id';
import { positionAtEnd, positionBetween } from '@/lib/ordering';

export interface CreateFolderInput {
  projectId: string;
  name?: string;
  parentId?: FolderRef;
  color?: string;
}

export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  const parentId = input.parentId ?? ROOT;
  const siblings = await db.folders.where({ projectId: input.projectId, parentId }).toArray();

  const folder: Folder = {
    id: newId(),
    projectId: input.projectId,
    parentId,
    name: input.name?.trim() || 'New folder',
    position: positionAtEnd(siblings.map((f) => f.position)),
    ...(input.color ? { color: input.color } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    trashed: 0,
    deletedAt: null,
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || 'Untitled folder' });
}

/** Every descendant of `folderId`, breadth-first. Used by move and delete. */
export async function descendantFolderIds(folderId: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift()!;
    const children = (await db.folders.where({ parentId: current }).primaryKeys()) as string[];
    out.push(...children);
    queue.push(...children);
  }
  return out;
}

/**
 * Reparent and/or reorder a folder. Refuses to move a folder into its own
 * subtree — that would detach the branch from the root and make it
 * unreachable in the sidebar.
 */
export async function moveFolder(
  id: string,
  target: { parentId: FolderRef; beforeId?: string; afterId?: string },
): Promise<void> {
  await db.transaction('rw', db.folders, async () => {
    const folder = await db.folders.get(id);
    if (!folder) return;

    if (target.parentId !== ROOT) {
      if (target.parentId === id) return;
      const descendants = await descendantFolderIds(id);
      if (descendants.includes(target.parentId)) return;
    }

    const before = target.beforeId ? await db.folders.get(target.beforeId) : undefined;
    const after = target.afterId ? await db.folders.get(target.afterId) : undefined;

    let position: number;
    if (before || after) {
      position = positionBetween(before?.position, after?.position);
    } else {
      const siblings = await db.folders
        .where({ projectId: folder.projectId, parentId: target.parentId })
        .toArray();
      position = positionAtEnd(siblings.map((f) => f.position));
    }

    await db.folders.update(id, { parentId: target.parentId, position });
  });
}

export type FolderDeleteStrategy =
  /** Citations inside become unfiled; the subtree collapses into its parent. */
  | 'unfile'
  /** Citations go to the trash along with the folder. */
  | 'trash';

export async function trashFolder(
  id: string,
  strategy: FolderDeleteStrategy = 'unfile',
): Promise<void> {
  const deletedAt = Date.now();
  await db.transaction('rw', [db.folders, db.citations], async () => {
    const folder = await db.folders.get(id);
    if (!folder) return;
    const ids = [id, ...(await descendantFolderIds(id))];

    if (strategy === 'trash') {
      await db.citations.where('folderId').anyOf(ids).modify({ trashed: 1, deletedAt });
    } else {
      await db.citations.where('folderId').anyOf(ids).modify({ folderId: folder.parentId });
    }
    await db.folders.where('id').anyOf(ids).modify({ trashed: 1, deletedAt });
  });
}

export async function restoreFolder(id: string): Promise<void> {
  await db.transaction('rw', [db.folders, db.citations], async () => {
    const ids = [id, ...(await descendantFolderIds(id))];
    await db.folders.where('id').anyOf(ids).modify({ trashed: 0, deletedAt: null });
    await db.citations.where('folderId').anyOf(ids).modify({ trashed: 0, deletedAt: null });
  });
}

export async function destroyFolder(id: string): Promise<void> {
  await db.transaction('rw', [db.folders, db.citations], async () => {
    const ids = [id, ...(await descendantFolderIds(id))];
    await db.citations.where('folderId').anyOf(ids).modify({ folderId: ROOT });
    await db.folders.where('id').anyOf(ids).delete();
  });
}
