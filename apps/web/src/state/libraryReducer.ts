import { initialLibraryState, type LibraryAction, type LibraryUIState } from './types';

/**
 * Pure view-state transitions. No database access lives here — mutations go
 * through the repositories and are exposed as the actions object in
 * `LibraryContext`. Keeping the reducer pure makes selection behaviour (the
 * fiddly part: shift-ranges, filters clearing selection) directly testable.
 */
export function libraryReducer(state: LibraryUIState, action: LibraryAction): LibraryUIState {
  switch (action.type) {
    case 'bootstrapped':
      return {
        ...state,
        activeProjectId: action.projectId,
        status: { state: 'ready' },
      };

    case 'bootstrap-failed':
      return { ...state, status: action.status };

    case 'set-view':
      return { ...state, view: action.view };

    case 'select-project':
      if (action.projectId === state.activeProjectId) return state;
      // Switching projects invalidates every filter scoped to the old one.
      return {
        ...state,
        // Leaving the trash when a project is chosen: the trash is global, so
        // staying in it after picking a project would ignore the click.
        view: state.view === 'trash' ? 'references' : state.view,
        activeProjectId: action.projectId,
        activeFolderId: undefined,
        selectedIds: [],
        lastSelectedId: undefined,
        inspectingId: undefined,
        search: '',
        tagFilter: [],
        favoritesOnly: false,
      };

    case 'select-folder':
      return {
        ...state,
        view: state.view === 'trash' ? 'references' : state.view,
        activeFolderId: action.folderId,
        selectedIds: [],
        lastSelectedId: undefined,
      };

    case 'set-search':
      // Selected rows may scroll out of the filtered view; dropping the
      // selection keeps bulk actions honest about what they will touch.
      return { ...state, search: action.search, selectedIds: [], lastSelectedId: undefined };

    case 'set-tag-filter':
      return { ...state, tagFilter: action.tags, selectedIds: [] };

    case 'toggle-favorites-only':
      return { ...state, favoritesOnly: !state.favoritesOnly, selectedIds: [] };

    case 'set-sort':
      return { ...state, sortOverride: action.sort };

    case 'select-citation': {
      const { id, mode, visibleIds } = action;
      if (mode === 'replace') {
        return { ...state, selectedIds: [id], lastSelectedId: id, inspectingId: id };
      }
      if (mode === 'toggle') {
        const selected = state.selectedIds.includes(id);
        return {
          ...state,
          selectedIds: selected
            ? state.selectedIds.filter((x) => x !== id)
            : [...state.selectedIds, id],
          lastSelectedId: id,
        };
      }
      // Range: from the anchor to the clicked row, in the order shown.
      const anchor = state.lastSelectedId ?? id;
      const from = visibleIds.indexOf(anchor);
      const to = visibleIds.indexOf(id);
      if (from === -1 || to === -1) {
        return { ...state, selectedIds: [id], lastSelectedId: id };
      }
      const range = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
      return { ...state, selectedIds: [...new Set([...state.selectedIds, ...range])] };
    }

    case 'set-selection':
      return { ...state, selectedIds: [...new Set(action.ids)] };

    case 'clear-selection':
      return { ...state, selectedIds: [], lastSelectedId: undefined };

    case 'inspect':
      return { ...state, inspectingId: action.id };

    case 'open-dialog':
      return { ...state, dialog: action.dialog };

    case 'close-dialog':
      return { ...state, dialog: null };

    default:
      return state;
  }
}

export { initialLibraryState };
