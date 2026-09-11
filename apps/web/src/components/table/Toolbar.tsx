import { ArrowUpDown, Plus, Search, Star, Trash2, X } from 'lucide-react';
import type { CitationSortField } from '@opencite/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toaster';
import {
  useActiveProject,
  useLibraryActions,
  useLibraryState,
  useProjectTags,
} from '@/state';
import { cn } from '@/lib/utils';

const SORT_OPTIONS: Array<{ field: CitationSortField; label: string }> = [
  { field: 'sortKey', label: 'Author and year' },
  { field: 'title', label: 'Title' },
  { field: 'createdAt', label: 'Date added' },
  { field: 'updatedAt', label: 'Last edited' },
  { field: 'type', label: 'Type' },
];

/** Search, filters, sort, and whatever applies to the current selection. */
export function Toolbar() {
  const state = useLibraryState();
  const project = useActiveProject();
  const actions = useLibraryActions();
  const tags = useProjectTags();
  const { toast } = useToast();

  const sort = state.sortOverride ?? project?.sort ?? { field: 'sortKey', direction: 'asc' };
  const selectedCount = state.selectedIds.length;

  const deleteSelected = async () => {
    const ids = state.selectedIds;
    await actions.deleteCitations(ids);
    toast(`${ids.length} reference${ids.length === 1 ? '' : 's'} deleted.`, {
      action: { label: 'Undo', onClick: () => actions.undo() },
    });
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="library-search"
            value={state.search}
            onChange={(event) => actions.setSearch(event.target.value)}
            placeholder="Search this project"
            aria-label="Search references in this project"
            className="h-8 pl-8 text-sm"
          />
          {state.search && (
            <button
              type="button"
              onClick={() => actions.setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant={state.favoritesOnly ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => actions.toggleFavoritesOnly()}
          aria-pressed={state.favoritesOnly}
        >
          <Star className={cn('h-3.5 w-3.5', state.favoritesOnly && 'fill-amber-400 text-amber-400')} />
          Favourites
        </Button>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>Sort by</MenuLabel>
            {SORT_OPTIONS.map((option) => (
              <MenuItem
                key={option.field}
                onSelect={() => actions.setSort({ field: option.field, direction: sort.direction })}
                className={cn(sort.field === option.field && 'bg-accent')}
              >
                {option.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              onSelect={() =>
                actions.setSort({
                  field: sort.field,
                  direction: sort.direction === 'asc' ? 'desc' : 'asc',
                })
              }
            >
              {sort.direction === 'asc' ? 'Descending' : 'Ascending'}
            </MenuItem>
          </MenuContent>
        </Menu>

        <Button
          variant="outline"
          size="sm"
          onClick={() => actions.openDialog({ kind: 'manual-entry' })}
        >
          <Plus className="h-3.5 w-3.5" />
          Add by hand
        </Button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.slice(0, 12).map(([tag, count]) => {
            const active = state.tagFilter.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  actions.setTagFilter(
                    active ? state.tagFilter.filter((t) => t !== tag) : [...state.tagFilter, tag],
                  )
                }
                className={cn(
                  'rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent',
                  active && 'border-transparent bg-primary text-primary-foreground',
                )}
              >
                {tag} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm">
          <span className="font-medium tabular-nums">{selectedCount} selected</span>
          <span className="text-xs text-muted-foreground">Drag onto a folder to file them</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => actions.clearSelection()}>
              Clear
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteSelected()}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
