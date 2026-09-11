import type { CSLItem, CitationSort, FolderRef } from '@opencite/shared';

/**
 * Everything the UI needs that is *not* in the database.
 *
 * The rule this whole layer is built on: persisted data is never copied into
 * React state. Rows live in Dexie and reach components through `useLiveQuery`;
 * this context holds only ephemeral view state — what is selected, what is
 * typed in the search box, which dialog is open. That way a write from any
 * surface (a paste, an import, a second browser tab) updates every view
 * without a store to keep in sync.
 */
/** Which of the main panes is showing. */
export type LibraryView = 'references' | 'bibliography' | 'trash';

export interface LibraryUIState {
  view: LibraryView;
  /** `undefined` until bootstrap picks the last-opened or first project. */
  activeProjectId: string | undefined;
  /** `undefined` = "All references"; `ROOT` = the Unfiled pseudo-folder. */
  activeFolderId: FolderRef | undefined;
  /** Row selection for bulk actions. Order is not meaningful. */
  selectedIds: string[];
  /** Anchor for shift-click range selection. */
  lastSelectedId: string | undefined;
  search: string;
  tagFilter: string[];
  favoritesOnly: boolean;
  /** Per-session sort override; `undefined` falls back to the project's. */
  sortOverride: CitationSort | undefined;
  /** Which citation the detail/edit panel is showing. */
  inspectingId: string | undefined;
  /** Sidebar collapsed to give the list the full width. */
  sidebarCollapsed: boolean;
  dialog: DialogState | null;
  status: BootstrapStatus;
}

export type DialogState =
  /** `prefill` seeds a new reference — used when a lookup got partway there. */
  | { kind: 'manual-entry'; citationId?: string; prefill?: Partial<CSLItem> }
  | { kind: 'autocite' }
  | { kind: 'style-picker' }
  | { kind: 'export' }
  | { kind: 'import' }
  | { kind: 'project-settings'; projectId: string }
  | { kind: 'confirm-destroy'; ids: string[] };

export type BootstrapStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; reason: 'unsupported' | 'denied' | 'version-mismatch'; message: string };

export type LibraryAction =
  | { type: 'bootstrapped'; projectId: string | undefined }
  | { type: 'bootstrap-failed'; status: Extract<BootstrapStatus, { state: 'error' }> }
  | { type: 'set-view'; view: LibraryView }
  | { type: 'select-project'; projectId: string | undefined }
  | { type: 'select-folder'; folderId: FolderRef | undefined }
  | { type: 'set-search'; search: string }
  | { type: 'set-tag-filter'; tags: string[] }
  | { type: 'toggle-favorites-only' }
  | { type: 'set-sort'; sort: CitationSort | undefined }
  | { type: 'select-citation'; id: string; mode: 'replace' | 'toggle' | 'range'; visibleIds: string[] }
  | { type: 'set-selection'; ids: string[] }
  | { type: 'clear-selection' }
  | { type: 'inspect'; id: string | undefined }
  | { type: 'toggle-sidebar' }
  | { type: 'open-dialog'; dialog: DialogState }
  | { type: 'close-dialog' };

export const initialLibraryState: LibraryUIState = {
  view: 'references',
  activeProjectId: undefined,
  activeFolderId: undefined,
  selectedIds: [],
  lastSelectedId: undefined,
  search: '',
  tagFilter: [],
  favoritesOnly: false,
  sortOverride: undefined,
  inspectingId: undefined,
  sidebarCollapsed: false,
  dialog: null,
  status: { state: 'loading' },
};
