import {
  ROOT,
  type CSLItem,
  type CSLItemType,
  type Citation,
  type CitationSource,
  type FolderRef,
} from '@opencite/shared';
import { db } from '../dexieStore';
import { newId } from '@/lib/id';
import { positionAtEnd, positionBetween } from '@/lib/ordering';
import { deriveCitationIndexes } from '@/lib/derive';

export interface CreateCitationInput {
  projectId: string;
  csl: Omit<CSLItem, 'id'> & { id?: string };
  folderId?: FolderRef;
  source?: CitationSource;
  tags?: string[];
  notes?: string;
}

const MANUAL_SOURCE: CitationSource = { kind: 'manual', input: '', key: '' };

export async function createCitation(input: CreateCitationInput): Promise<Citation> {
  const id = input.csl.id ?? newId();
  const csl = { ...input.csl, id } as CSLItem;
  const tags = input.tags ?? [];
  const folderId = input.folderId ?? ROOT;

  const siblings = await db.citations.where({ projectId: input.projectId, folderId }).toArray();

  const citation: Citation = {
    id,
    projectId: input.projectId,
    folderId,
    csl,
    ...deriveCitationIndexes(csl, tags, input.notes),
    tags,
    ...(input.notes ? { notes: input.notes } : {}),
    favorite: 0,
    source: input.source ?? MANUAL_SOURCE,
    position: positionAtEnd(siblings.map((c) => c.position)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    trashed: 0,
    deletedAt: null,
  };

  await db.citations.add(citation);
  return citation;
}

/** Bulk insert for imports (BibTeX/RIS paste, Step 5) — one transaction. */
export async function createCitations(
  projectId: string,
  items: Array<Omit<CreateCitationInput, 'projectId'>>,
): Promise<string[]> {
  return db.transaction('rw', db.citations, async () => {
    const ids: string[] = [];
    for (const item of items) {
      const created = await createCitation({ ...item, projectId });
      ids.push(created.id);
    }
    return ids;
  });
}

/**
 * Patch a citation's CSL payload. Callers pass only the fields they changed;
 * the derived index columns are always recomputed from the merged result so
 * search and sort can never fall out of step with the metadata.
 *
 * Any edit flips `source.edited`, which is what lets the UI warn before a
 * re-fetch would overwrite hand-corrected metadata.
 */
export async function updateCitationCSL(
  id: string,
  patch: Partial<CSLItem>,
): Promise<void> {
  await db.transaction('rw', db.citations, async () => {
    const existing = await db.citations.get(id);
    if (!existing) return;

    // `id` is structural, not metadata — never let a patch move it.
    const { id: _ignored, ...safePatch } = patch;
    const csl = { ...existing.csl, ...safePatch, id: existing.id } as CSLItem;

    // An explicitly-undefined key in the patch means "clear this field".
    for (const [key, value] of Object.entries(safePatch)) {
      if (value === undefined) delete csl[key];
    }

    await db.citations.update(id, {
      csl,
      ...deriveCitationIndexes(csl, existing.tags, existing.notes),
      source: { ...existing.source, edited: true },
    });
  });
}

export async function setCitationType(id: string, type: CSLItemType): Promise<void> {
  await updateCitationCSL(id, { type });
}

export async function setCitationTags(id: string, tags: string[]): Promise<void> {
  await db.transaction('rw', db.citations, async () => {
    const existing = await db.citations.get(id);
    if (!existing) return;
    const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    await db.citations.update(id, {
      tags: unique,
      ...deriveCitationIndexes(existing.csl, unique, existing.notes),
    });
  });
}

export async function setCitationNotes(id: string, notes: string): Promise<void> {
  await db.transaction('rw', db.citations, async () => {
    const existing = await db.citations.get(id);
    if (!existing) return;
    await db.citations.update(id, {
      notes,
      ...deriveCitationIndexes(existing.csl, existing.tags, notes),
    });
  });
}

export async function toggleFavorite(id: string): Promise<void> {
  await db.transaction('rw', db.citations, async () => {
    const existing = await db.citations.get(id);
    if (!existing) return;
    await db.citations.update(id, { favorite: existing.favorite ? 0 : 1 });
  });
}

/**
 * Move citations into a folder, optionally to a precise slot for drag-and-drop.
 * Cross-project moves are supported (dragging onto another project in the
 * sidebar) and re-slot the row at the end of the destination.
 */
export async function moveCitations(
  ids: string[],
  target: {
    projectId?: string;
    folderId: FolderRef;
    beforeId?: string;
    afterId?: string;
  },
): Promise<void> {
  await db.transaction('rw', db.citations, async () => {
    const before = target.beforeId ? await db.citations.get(target.beforeId) : undefined;
    const after = target.afterId ? await db.citations.get(target.afterId) : undefined;
    const precise = Boolean(before || after) && ids.length === 1;

    let endPosition = 0;
    if (!precise) {
      const first = await db.citations.get(ids[0]!);
      const projectId = target.projectId ?? first?.projectId;
      if (!projectId) return;
      const siblings = await db.citations
        .where({ projectId, folderId: target.folderId })
        .toArray();
      endPosition = positionAtEnd(siblings.map((c) => c.position));
    }

    for (const [index, id] of ids.entries()) {
      await db.citations.update(id, {
        folderId: target.folderId,
        ...(target.projectId ? { projectId: target.projectId } : {}),
        position: precise
          ? positionBetween(before?.position, after?.position)
          : endPosition + index * 0.001,
      });
    }
  });
}

export async function trashCitations(ids: string[]): Promise<void> {
  const deletedAt = Date.now();
  await db.citations.where('id').anyOf(ids).modify({ trashed: 1, deletedAt });
}

export async function restoreCitations(ids: string[]): Promise<void> {
  await db.citations.where('id').anyOf(ids).modify({ trashed: 0, deletedAt: null });
}

export async function destroyCitations(ids: string[]): Promise<void> {
  await db.citations.where('id').anyOf(ids).delete();
}

/** Copy references into another project, keeping the originals. */
export async function copyCitationsToProject(
  ids: string[],
  projectId: string,
  folderId: FolderRef = ROOT,
): Promise<string[]> {
  return db.transaction('rw', db.citations, async () => {
    const sources = await db.citations.where('id').anyOf(ids).toArray();
    const created: string[] = [];
    for (const source of sources) {
      // Drop the id so the copy gets a fresh one — two rows sharing a CSL id
      // would collide in the citeproc registry.
      const { id: _oldId, ...csl } = source.csl;
      const copy = await createCitation({
        projectId,
        folderId,
        csl,
        source: source.source,
        tags: source.tags,
        ...(source.notes ? { notes: source.notes } : {}),
      });
      created.push(copy.id);
    }
    return created;
  });
}

/** Permanently removes trashed rows older than `olderThanMs`. */
export async function emptyTrash(olderThanMs = 0): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  return db.transaction('rw', [db.citations, db.folders, db.projects], async () => {
    const stale = (row: { deletedAt: number | null }) =>
      row.deletedAt !== null && row.deletedAt <= cutoff;
    const citations = await db.citations.where({ trashed: 1 }).filter(stale).primaryKeys();
    const folders = await db.folders.where({ trashed: 1 }).filter(stale).primaryKeys();
    const projects = await db.projects.where({ trashed: 1 }).filter(stale).primaryKeys();
    await db.citations.bulkDelete(citations as string[]);
    await db.folders.bulkDelete(folders as string[]);
    await db.projects.bulkDelete(projects as string[]);
    return citations.length + folders.length + projects.length;
  });
}
