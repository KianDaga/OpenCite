import { useContext, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ROOT, type Citation, type CitationSort, type Folder, type Project } from '@opencite/shared';
import { db } from '@/db/dexieStore';
import * as repo from '@/db/repositories';
import { LibraryActionsContext, LibraryStateContext, type LibraryActions } from './LibraryContext';
import type { LibraryUIState } from './types';

/**
 * The read API.
 *
 * Each hook is a `useLiveQuery` over the repositories' query functions. Dexie
 * tracks which tables and key ranges a query touched and re-runs only the
 * queries a given write could have affected, so components stay current
 * without any subscription bookkeeping here — and without a store that could
 * disagree with what is on disk. It also works across browser tabs, so two
 * open copies of OpenCite never drift apart.
 */

export function useLibraryState(): LibraryUIState {
  const state = useContext(LibraryStateContext);
  if (!state) throw new Error('useLibraryState must be used inside <LibraryProvider>');
  return state;
}

export function useLibraryActions(): LibraryActions {
  const actions = useContext(LibraryActionsContext);
  if (!actions) throw new Error('useLibraryActions must be used inside <LibraryProvider>');
  return actions;
}

export function useProjects(): Project[] {
  return useLiveQuery(() => repo.liveProjects(), [], []);
}

export function useActiveProject(): Project | undefined {
  const { activeProjectId } = useLibraryState();
  return useLiveQuery(
    () => (activeProjectId ? db.projects.get(activeProjectId) : undefined),
    [activeProjectId],
    undefined,
  );
}

export function useFolders(): Folder[] {
  const { activeProjectId } = useLibraryState();
  return useLiveQuery(() => repo.liveFolders(activeProjectId), [activeProjectId], []);
}

/** Sidebar tree with rolled-up citation counts. */
export function useFolderTree(): { tree: repo.FolderNode[]; unfiled: number; total: number } {
  const { activeProjectId } = useLibraryState();
  const folders = useFolders();
  const counts = useLiveQuery(
    () => repo.citationCounts(activeProjectId),
    [activeProjectId],
    new Map<string, number>(),
  );

  return useMemo(() => {
    const tree = repo.buildFolderTree(folders, counts);
    let total = 0;
    for (const n of counts.values()) total += n;
    return { tree, unfiled: counts.get(ROOT) ?? 0, total };
  }, [folders, counts]);
}

/** The main table's rows, honouring folder, search, tag and favourite filters. */
export function useCitations(): Citation[] {
  const state = useLibraryState();
  const project = useActiveProject();
  const sort: CitationSort | undefined = state.sortOverride ?? project?.sort;

  return useLiveQuery(
    () =>
      repo.queryCitations({
        projectId: state.activeProjectId,
        folderId: state.activeFolderId,
        search: state.search,
        tags: state.tagFilter,
        favoritesOnly: state.favoritesOnly,
        ...(sort ? { sort } : {}),
      }),
    [
      state.activeProjectId,
      state.activeFolderId,
      state.search,
      // Arrays are new objects each render; join them so the dependency is
      // compared by value and the query does not re-run on every keystroke.
      state.tagFilter.join('|'),
      state.favoritesOnly,
      sort?.field,
      sort?.direction,
    ],
    [],
  );
}

export function useCitation(id: string | undefined): Citation | undefined {
  return useLiveQuery(() => (id ? db.citations.get(id) : undefined), [id], undefined);
}

/** The citation the detail panel is showing. */
export function useInspectedCitation(): Citation | undefined {
  const { inspectingId } = useLibraryState();
  return useCitation(inspectingId);
}

export function useSelectedCitations(): Citation[] {
  const { selectedIds } = useLibraryState();
  const key = selectedIds.join('|');
  return useLiveQuery(
    () => (selectedIds.length ? db.citations.where('id').anyOf(selectedIds).toArray() : []),
    [key],
    [],
  );
}

export function useProjectTags(): Array<[string, number]> {
  const { activeProjectId } = useLibraryState();
  return useLiveQuery(() => repo.projectTags(activeProjectId), [activeProjectId], []);
}

export function useTrash(): Citation[] {
  return useLiveQuery(() => repo.trashedCitations(), [], []);
}
