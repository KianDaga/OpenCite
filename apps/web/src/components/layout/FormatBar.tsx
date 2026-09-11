import { ArrowDownAZ, ChevronDown, Type } from 'lucide-react';
import type { CitationSortField } from '@opencite/shared';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { findStyle } from '@/citation';
import {
  BIBLIOGRAPHY_FONTS,
  FONT_SIZES,
  useActiveProject,
  useAppearance,
  useCitations,
  useLibraryActions,
  useLibraryState,
} from '@/state';
import { cn } from '@/lib/utils';

const SORT_OPTIONS: Array<{ field: CitationSortField; label: string }> = [
  { field: 'sortKey', label: 'Author and year' },
  { field: 'title', label: 'Title' },
  { field: 'createdAt', label: 'Date added' },
  { field: 'updatedAt', label: 'Last edited' },
  { field: 'type', label: 'Type' },
  { field: 'position', label: 'Manual order' },
];

/**
 * The row under the cite bar: what the bibliography looks like and how it is
 * ordered.
 *
 * Font and size are here rather than in a settings screen because they are
 * part of matching a document's requirements — a style guide that asks for
 * 12pt Times is asking about this, not about a preference.
 */
export function FormatBar({ className }: { className?: string }) {
  const state = useLibraryState();
  const project = useActiveProject();
  const citations = useCitations();
  const actions = useLibraryActions();
  const { fontFamily, fontSize, setFontFamily, setFontSize } = useAppearance();

  const sort = state.sortOverride ?? project?.sort ?? { field: 'sortKey', direction: 'asc' };
  const style = project ? findStyle(project.styleId) : undefined;
  const allSelected = citations.length > 0 && state.selectedIds.length === citations.length;
  const sortLabel = SORT_OPTIONS.find((o) => o.field === sort.field)?.label ?? 'Sort';

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm', className)}>
      <input
        type="checkbox"
        aria-label={allSelected ? 'Deselect all references' : 'Select all references'}
        checked={allSelected}
        disabled={citations.length === 0}
        onChange={() =>
          actions.setSelection(allSelected ? [] : citations.map((c) => c.id))
        }
        className="h-4 w-4 rounded border-input"
      />

      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" className="font-normal">
            <Type className="h-3.5 w-3.5" />
            {fontFamily}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuLabel>Bibliography font</MenuLabel>
          {BIBLIOGRAPHY_FONTS.map((font) => (
            <MenuItem
              key={font.id}
              onSelect={() => setFontFamily(font.id)}
              className={cn(font.id === fontFamily && 'bg-accent')}
            >
              <span style={{ fontFamily: font.stack }}>{font.label}</span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" className="font-normal tabular-nums">
            {fontSize}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuLabel>Size</MenuLabel>
          {FONT_SIZES.map((size) => (
            <MenuItem
              key={size}
              onSelect={() => setFontSize(size)}
              className={cn(size === fontSize && 'bg-accent')}
            >
              {size} pt
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <Button
        variant="outline"
        size="sm"
        className="font-normal"
        onClick={() => actions.openDialog({ kind: 'style-picker' })}
      >
        {style?.title ?? project?.styleId ?? 'Citation style'}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" className="ml-auto font-normal">
            <ArrowDownAZ className="h-3.5 w-3.5" />
            {sort.field === 'position' ? 'Manual order' : `Sort: ${sortLabel}`}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLabel>Order references by</MenuLabel>
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
            {sort.direction === 'asc' ? 'Reverse (Z–A)' : 'Reverse (A–Z)'}
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
