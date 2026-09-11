import { describe, expect, it } from 'vitest';
import { initialLibraryState, libraryReducer } from '@/state/libraryReducer';

const visible = ['a', 'b', 'c', 'd', 'e'];

describe('libraryReducer', () => {
  it('replaces the selection on a plain click', () => {
    const s = libraryReducer(initialLibraryState, {
      type: 'select-citation',
      id: 'b',
      mode: 'replace',
      visibleIds: visible,
    });
    expect(s.selectedIds).toEqual(['b']);
    expect(s.inspectingId).toBe('b');
  });

  it('toggles rows in and out on ctrl-click', () => {
    let s = libraryReducer(initialLibraryState, {
      type: 'select-citation',
      id: 'b',
      mode: 'toggle',
      visibleIds: visible,
    });
    s = libraryReducer(s, { type: 'select-citation', id: 'd', mode: 'toggle', visibleIds: visible });
    expect(s.selectedIds).toEqual(['b', 'd']);

    s = libraryReducer(s, { type: 'select-citation', id: 'b', mode: 'toggle', visibleIds: visible });
    expect(s.selectedIds).toEqual(['d']);
  });

  it('selects a range from the anchor, in either direction', () => {
    let s = libraryReducer(initialLibraryState, {
      type: 'select-citation',
      id: 'd',
      mode: 'replace',
      visibleIds: visible,
    });
    s = libraryReducer(s, { type: 'select-citation', id: 'b', mode: 'range', visibleIds: visible });
    expect(s.selectedIds).toEqual(['d', 'b', 'c']);
  });

  it('drops the selection when a filter changes what is visible', () => {
    let s = libraryReducer(initialLibraryState, {
      type: 'select-citation',
      id: 'b',
      mode: 'replace',
      visibleIds: visible,
    });
    s = libraryReducer(s, { type: 'set-search', search: 'kant' });
    expect(s.selectedIds).toEqual([]);
  });

  it('clears project-scoped filters when switching projects', () => {
    let s = libraryReducer(initialLibraryState, { type: 'select-project', projectId: 'p1' });
    s = libraryReducer(s, { type: 'set-search', search: 'hume' });
    s = libraryReducer(s, { type: 'set-tag-filter', tags: ['unread'] });
    s = libraryReducer(s, { type: 'select-folder', folderId: 'f1' });

    const switched = libraryReducer(s, { type: 'select-project', projectId: 'p2' });
    expect(switched.search).toBe('');
    expect(switched.tagFilter).toEqual([]);
    expect(switched.activeFolderId).toBeUndefined();
  });

  it('is a no-op when re-selecting the project already open', () => {
    const s = libraryReducer(initialLibraryState, { type: 'select-project', projectId: undefined });
    expect(s).toBe(initialLibraryState);
  });
});
