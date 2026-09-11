import { beforeEach, describe, expect, it } from 'vitest';
import { ROOT } from '@opencite/shared';
import { db, resetDatabase } from '@/db/dexieStore';
import * as repo from '@/db/repositories';

async function seedProject() {
  const project = await repo.createProject({ name: 'Thesis' });
  return project.id;
}

describe('dexie schema', () => {
  beforeEach(async () => {
    await db.open();
    await resetDatabase();
  });

  it('derives search and sort columns from the CSL payload', async () => {
    const projectId = await seedProject();
    const citation = await repo.createCitation({
      projectId,
      csl: {
        type: 'article-journal',
        title: 'Attention Is All You Need',
        author: [{ family: 'Vaswani', given: 'Ashish' }],
        issued: { 'date-parts': [[2017]] },
      },
    });

    expect(citation.sortKey).toBe('vaswani 2017 attention is all you need');
    expect(citation.keywords).toContain('vaswani');
    expect(citation.csl.id).toBe(citation.id);
  });

  it('keeps derived columns in step with edits', async () => {
    const projectId = await seedProject();
    const { id } = await repo.createCitation({
      projectId,
      csl: { type: 'book', title: 'Old title', author: [{ family: 'Arendt', given: 'Hannah' }] },
    });

    await repo.updateCitationCSL(id, { title: 'The Human Condition' });
    const updated = await db.citations.get(id);

    expect(updated!.csl.title).toBe('The Human Condition');
    expect(updated!.sortKey).toContain('the human condition');
    expect(updated!.searchBlob).not.toContain('old title');
    expect(updated!.source.edited).toBe(true);
  });

  it('finds root-level folders through the parentId index', async () => {
    const projectId = await seedProject();
    const parent = await repo.createFolder({ projectId, name: 'Chapter 1' });
    await repo.createFolder({ projectId, name: 'Sources', parentId: parent.id });

    // The regression this guards: IndexedDB cannot index null, so a nullable
    // parentId would leave root folders out of this query entirely.
    const roots = await db.folders.where({ projectId, parentId: ROOT }).toArray();
    expect(roots.map((f) => f.name)).toEqual(['Chapter 1']);
  });

  it('unfiles citations when their folder is deleted', async () => {
    const projectId = await seedProject();
    const folder = await repo.createFolder({ projectId, name: 'Drafts' });
    const { id } = await repo.createCitation({
      projectId,
      folderId: folder.id,
      csl: { type: 'webpage', title: 'A page' },
    });

    await repo.trashFolder(folder.id, 'unfile');
    const citation = await db.citations.get(id);

    expect(citation!.folderId).toBe(ROOT);
    expect(citation!.trashed).toBe(0);
  });

  it('cascades trash and restore from a project to its citations', async () => {
    const projectId = await seedProject();
    const { id } = await repo.createCitation({
      projectId,
      csl: { type: 'book', title: 'Cascading' },
    });

    await repo.trashProject(projectId);
    expect((await db.citations.get(id))!.trashed).toBe(1);

    await repo.restoreProject(projectId);
    expect((await db.citations.get(id))!.trashed).toBe(0);
  });

  it('matches citations on prefix search across fields', async () => {
    const projectId = await seedProject();
    await repo.createCitation({
      projectId,
      csl: {
        type: 'article-journal',
        title: 'Climate sensitivity revisited',
        'container-title': 'Nature',
        author: [{ family: 'Hansen', given: 'James' }],
      },
    });
    await repo.createCitation({ projectId, csl: { type: 'book', title: 'Unrelated' } });

    const hits = await repo.queryCitations({ projectId, search: 'hans clim' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.csl.title).toBe('Climate sensitivity revisited');
  });

  it('gives copied citations fresh ids', async () => {
    const a = await seedProject();
    const b = (await repo.createProject({ name: 'Second' })).id;
    const { id } = await repo.createCitation({ projectId: a, csl: { type: 'book', title: 'Shared' } });

    const [copyId] = await repo.copyCitationsToProject([id], b);
    const copy = await db.citations.get(copyId!);

    expect(copyId).not.toBe(id);
    expect(copy!.csl.id).toBe(copyId);
    expect(copy!.projectId).toBe(b);
    expect(await db.citations.get(id)).toBeDefined();
  });
});

describe('duplicate detection', () => {
  beforeEach(async () => {
    await db.open();
    await resetDatabase();
  });

  it('recognises the same work arriving by DOI and by its publisher page', async () => {
    const projectId = await seedProject();
    await repo.createCitation({
      projectId,
      csl: { type: 'article-journal', title: 'A paper', DOI: '10.1038/nature12373' },
      source: { kind: 'doi', input: '10.1038/nature12373', key: 'doi:10.1038/nature12373' },
    });

    // Reached from the publisher's page this time, so a different source key —
    // but the DOI says it is the same paper.
    const found = await repo.findExisting(projectId, {
      key: 'url:https://www.nature.com/articles/nature12373',
      doi: '10.1038/NATURE12373',
    });

    expect(found?.csl.title).toBe('A paper');
  });

  it('matches a book across ISBN formatting', async () => {
    const projectId = await seedProject();
    await repo.createCitation({
      projectId,
      csl: { type: 'book', title: 'A book', ISBN: '9780226025988' },
    });

    expect(await repo.findExisting(projectId, { isbn: '978-0-226-02598-8' })).toBeDefined();
  });

  it('does not treat unrelated references as duplicates', async () => {
    const projectId = await seedProject();
    await repo.createCitation({
      projectId,
      csl: { type: 'book', title: 'A book', ISBN: '9780226025988' },
    });

    expect(await repo.findExisting(projectId, { isbn: '9780306406157' })).toBeUndefined();
    expect(await repo.findExisting(projectId, {})).toBeUndefined();
  });
});
