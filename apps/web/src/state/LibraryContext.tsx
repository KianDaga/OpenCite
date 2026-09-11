import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { ROOT, type CSLItem, type CitationSort, type FolderRef } from '@opencite/shared';
import { openDatabase } from '@/db/dexieStore';
import * as repo from '@/db/repositories';
import { SETTING_KEYS, getSetting, setSetting } from '@/db/repositories/settings';
import { initialLibraryState, libraryReducer } from './libraryReducer';
import type { DialogState, LibraryUIState } from './types';

/**
 * Two contexts, deliberately.
 *
 * `LibraryStateContext` changes on every keystroke in the search box;
 * `LibraryActionsContext` never changes at all. Splitting them means a
 * component that only dispatches (a toolbar button, a row's context menu)
 * subscribes to the stable half and does not re-render while the user types.
 */
export const LibraryStateContext = createContext<LibraryUIState | null>(null);
export const LibraryActionsContext = createContext<LibraryActions | null>(null);

/** An action that can be reversed, for the undo toast. */
interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
}

export interface LibraryActions {
  // ---- Navigation & view state ----
  selectProject(projectId: string | undefined): void;
  selectFolder(folderId: FolderRef | undefined): void;
  setSearch(search: string): void;
  setTagFilter(tags: string[]): void;
  toggleFavoritesOnly(): void;
  setSort(sort: CitationSort | undefined): void;
  selectCitation(id: string, mode: 'replace' | 'toggle' | 'range', visibleIds: string[]): void;
  setSelection(ids: string[]): void;
  clearSelection(): void;
  inspect(id: string | undefined): void;
  openDialog(dialog: DialogState): void;
  closeDialog(): void;

  // ---- Projects ----
  createProject(input?: repo.CreateProjectInput): Promise<string>;
  renameProject(id: string, name: string): Promise<void>;
  setProjectStyle(id: string, styleId: string, localeId?: string): Promise<void>;
  duplicateProject(id: string): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // ---- Folders ----
  createFolder(input: Omit<repo.CreateFolderInput, 'projectId'>): Promise<string | undefined>;
  renameFolder(id: string, name: string): Promise<void>;
  moveFolder(id: string, target: { parentId: FolderRef; beforeId?: string; afterId?: string }): Promise<void>;
  deleteFolder(id: string, strategy?: repo.FolderDeleteStrategy): Promise<void>;

  // ---- Citations ----
  addCitation(csl: Omit<CSLItem, 'id'> & { id?: string }, options?: AddCitationOptions): Promise<string | undefined>;
  updateCitation(id: string, patch: Partial<CSLItem>): Promise<void>;
  setTags(id: string, tags: string[]): Promise<void>;
  setNotes(id: string, notes: string): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  moveCitations(ids: string[], target: { projectId?: string; folderId: FolderRef; beforeId?: string; afterId?: string }): Promise<void>;
  copyCitationsToProject(ids: string[], projectId: string): Promise<void>;
  deleteCitations(ids: string[]): Promise<void>;

  // ---- Trash & undo ----
  restoreCitations(ids: string[]): Promise<void>;
  destroyCitations(ids: string[]): Promise<void>;
  emptyTrash(): Promise<void>;
  undo(): Promise<void>;
  canUndo(): boolean;
}

export interface AddCitationOptions {
  folderId?: FolderRef;
  source?: repo.CreateCitationInput['source'];
  tags?: string[];
  notes?: string;
  /** Skip the duplicate check (used by imports, which may intend duplicates). */
  allowDuplicate?: boolean;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(libraryReducer, initialLibraryState);

  /**
   * Undo lives in a ref, not in reducer state: pushing an entry must not
   * re-render the tree, and the stack is only ever read at the moment the user
   * hits ⌘Z or the toast button.
   */
  const undoStack = useRef<UndoEntry[]>([]);
  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStack.current = [entry, ...undoStack.current].slice(0, 20);
  }, []);

  /**
   * The two ids actions need to read are mirrored into refs, so the actions
   * object can be built once and never close over a stale value. Reading them
   * from `state` instead would rebuild every action on each navigation and
   * re-render every consumer of the "stable" context.
   */
  const activeProjectId = useRef<string | undefined>(undefined);
  const activeFolderId = useRef<FolderRef | undefined>(undefined);
  activeProjectId.current = state.activeProjectId;
  activeFolderId.current = state.activeFolderId;

  // Bootstrap: open IndexedDB, restore the last project, seed the first one.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const status = await openDatabase();
      if (cancelled) return;

      if (status.state === 'blocked') {
        dispatch({
          type: 'bootstrap-failed',
          status: {
            state: 'error',
            reason: status.reason,
            message:
              status.reason === 'unsupported'
                ? 'This browser has no IndexedDB, so OpenCite has nowhere to keep your library.'
                : status.reason === 'denied'
                  ? 'Your browser blocked local storage. Private browsing windows often do — try a normal window.'
                  : 'Your library was saved by a newer version of OpenCite. Reload the page to pick up the update.',
          },
        });
        return;
      }

      const projects = await repo.liveProjects();
      const lastId = await getSetting<string | undefined>(SETTING_KEYS.lastProjectId, undefined);
      const restored = projects.find((p) => p.id === lastId) ?? projects[0];
      const projectId = restored?.id ?? (await repo.createProject({ name: 'My bibliography' })).id;

      if (!cancelled) dispatch({ type: 'bootstrapped', projectId });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Remember the open project across reloads.
  useEffect(() => {
    if (state.status.state !== 'ready' || !state.activeProjectId) return;
    void setSetting(SETTING_KEYS.lastProjectId, state.activeProjectId);
  }, [state.activeProjectId, state.status.state]);

  const actions = useMemo<LibraryActions>(() => {
    const requireProject = () => activeProjectId.current;

    return {
      // ---- Navigation & view state ----
      selectProject: (projectId) => dispatch({ type: 'select-project', projectId }),
      selectFolder: (folderId) => dispatch({ type: 'select-folder', folderId }),
      setSearch: (search) => dispatch({ type: 'set-search', search }),
      setTagFilter: (tags) => dispatch({ type: 'set-tag-filter', tags }),
      toggleFavoritesOnly: () => dispatch({ type: 'toggle-favorites-only' }),
      setSort: (sort) => dispatch({ type: 'set-sort', sort }),
      selectCitation: (id, mode, visibleIds) =>
        dispatch({ type: 'select-citation', id, mode, visibleIds }),
      setSelection: (ids) => dispatch({ type: 'set-selection', ids }),
      clearSelection: () => dispatch({ type: 'clear-selection' }),
      inspect: (id) => dispatch({ type: 'inspect', id }),
      openDialog: (dialog) => dispatch({ type: 'open-dialog', dialog }),
      closeDialog: () => dispatch({ type: 'close-dialog' }),

      // ---- Projects ----
      async createProject(input) {
        const project = await repo.createProject(input);
        dispatch({ type: 'select-project', projectId: project.id });
        return project.id;
      },
      renameProject: (id, name) => repo.updateProject(id, { name }),
      setProjectStyle: (id, styleId, localeId) =>
        repo.updateProject(id, { styleId, ...(localeId ? { localeId } : {}) }),
      async duplicateProject(id) {
        const copy = await repo.duplicateProject(id);
        if (copy) dispatch({ type: 'select-project', projectId: copy.id });
      },
      async deleteProject(id) {
        await repo.trashProject(id);
        pushUndo({ label: 'Project deleted', undo: () => repo.restoreProject(id) });
        if (activeProjectId.current === id) {
          const remaining = await repo.liveProjects();
          dispatch({ type: 'select-project', projectId: remaining[0]?.id });
        }
      },

      // ---- Folders ----
      async createFolder(input) {
        const projectId = requireProject();
        if (!projectId) return undefined;
        const folder = await repo.createFolder({ ...input, projectId });
        return folder.id;
      },
      renameFolder: repo.renameFolder,
      moveFolder: repo.moveFolder,
      async deleteFolder(id, strategy = 'unfile') {
        await repo.trashFolder(id, strategy);
        pushUndo({ label: 'Folder deleted', undo: () => repo.restoreFolder(id) });
        if (activeFolderId.current === id) dispatch({ type: 'select-folder', folderId: undefined });
      },

      // ---- Citations ----
      async addCitation(csl, options = {}) {
        const projectId = requireProject();
        if (!projectId) return undefined;

        if (!options.allowDuplicate) {
          // Match on the published identifiers as well as the source key: the
          // same paper reached by DOI and by its publisher page normalises to
          // two different keys but is still one reference.
          const existing = await repo.findExisting(projectId, {
            ...(options.source?.key ? { key: options.source.key } : {}),
            ...(typeof csl.DOI === 'string' ? { doi: csl.DOI } : {}),
            ...(typeof csl.ISBN === 'string' ? { isbn: csl.ISBN } : {}),
          });
          if (existing) {
            dispatch({ type: 'inspect', id: existing.id });
            return existing.id;
          }
        }

        const created = await repo.createCitation({
          projectId,
          csl,
          folderId: options.folderId ?? activeFolderId.current ?? ROOT,
          ...(options.source ? { source: options.source } : {}),
          ...(options.tags ? { tags: options.tags } : {}),
          ...(options.notes ? { notes: options.notes } : {}),
        });
        dispatch({ type: 'inspect', id: created.id });
        return created.id;
      },
      updateCitation: repo.updateCitationCSL,
      setTags: repo.setCitationTags,
      setNotes: repo.setCitationNotes,
      toggleFavorite: repo.toggleFavorite,
      moveCitations: repo.moveCitations,
      async copyCitationsToProject(ids, projectId) {
        await repo.copyCitationsToProject(ids, projectId);
      },
      async deleteCitations(ids) {
        await repo.trashCitations(ids);
        pushUndo({
          label: ids.length === 1 ? 'Reference deleted' : `${ids.length} references deleted`,
          undo: () => repo.restoreCitations(ids),
        });
        dispatch({ type: 'clear-selection' });
      },

      // ---- Trash & undo ----
      restoreCitations: repo.restoreCitations,
      destroyCitations: repo.destroyCitations,
      async emptyTrash() {
        await repo.emptyTrash();
        undoStack.current = [];
      },
      async undo() {
        const [entry, ...rest] = undoStack.current;
        if (!entry) return;
        undoStack.current = rest;
        await entry.undo();
      },
      canUndo: () => undoStack.current.length > 0,
    };
    // Built once: every piece of state these actions read comes from a ref.
  }, [pushUndo]);

  return (
    <LibraryStateContext.Provider value={state}>
      <LibraryActionsContext.Provider value={actions}>{children}</LibraryActionsContext.Provider>
    </LibraryStateContext.Provider>
  );
}
