import { Copy, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import type { Citation } from '@opencite/shared';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toaster';
import { CITATION_DRAG_TYPE } from '@/components/sidebar/Sidebar';
import { toPlainText, useInTextCitations } from '@/citation';
import { formatNameForDisplay, issuedYear } from '@/lib/derive';
import { typeLabel } from '@/lib/cslFields';
import { useCitations, useLibraryActions, useLibraryState } from '@/state';
import { cn } from '@/lib/utils';

/**
 * The reference list.
 *
 * A table rather than a rendered bibliography, because this is the working
 * view: it shows what each entry *is* (type, authors, year) so the user can
 * find and fix things. The formatted bibliography is a separate tab — the two
 * answer different questions, and the sort orders differ for the same reason.
 */
export function CitationTable() {
  const citations = useCitations();
  const { selectedIds, search } = useLibraryState();
  const actions = useLibraryActions();
  // Rendered for the whole visible list at once, so numeric styles number the
  // rows correctly instead of calling every one of them "[1]".
  const inTextLabels = useInTextCitations(citations);

  if (citations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <p className="text-sm font-medium">
          {search ? 'Nothing matches that search.' : 'No references yet.'}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {search
            ? 'Try a different word, or clear the search to see everything.'
            : 'Paste a URL, DOI or ISBN in the bar above — or add one by hand.'}
        </p>
        {!search && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => actions.openDialog({ kind: 'manual-entry' })}
          >
            Add by hand
          </Button>
        )}
      </div>
    );
  }

  const visibleIds = citations.map((c) => c.id);
  const allSelected = selectedIds.length === citations.length;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
        <input
          type="checkbox"
          aria-label={allSelected ? 'Deselect all references' : 'Select all references'}
          checked={allSelected}
          onChange={() => actions.setSelection(allSelected ? [] : visibleIds)}
          className="h-3.5 w-3.5 rounded border-input"
        />
        <span className="flex-1">Reference</span>
        <span className="hidden w-24 sm:block">Type</span>
        <span className="w-12 text-right">Year</span>
        <span className="w-16" />
      </div>

      <ul>
        {citations.map((citation) => (
          <CitationRow
            key={citation.id}
            citation={citation}
            visibleIds={visibleIds}
            inText={inTextLabels.get(citation.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function CitationRow({
  citation,
  visibleIds,
  inText,
}: {
  citation: Citation;
  visibleIds: string[];
  inText: string | undefined;
}) {
  const { selectedIds, inspectingId } = useLibraryState();
  const actions = useLibraryActions();
  const { toast } = useToast();

  const selected = selectedIds.includes(citation.id);
  const authors = citation.csl.author ?? citation.csl.editor ?? [];
  const year = issuedYear(citation.csl);

  const byline = authors.length
    ? authors.slice(0, 3).map(formatNameForDisplay).join(', ') + (authors.length > 3 ? ' et al.' : '')
    : 'No author';

  const remove = async () => {
    await actions.deleteCitations([citation.id]);
    toast('Reference deleted.', {
      action: { label: 'Undo', onClick: () => actions.undo() },
    });
  };

  const copyCitation = async () => {
    if (!inText) return;
    await navigator.clipboard.writeText(toPlainText(inText));
    toast('In-text citation copied.');
  };

  return (
    <li
      draggable
      onDragStart={(event) => {
        // Dragging an unselected row drags just that row; dragging a selected
        // one takes the whole selection with it.
        const ids = selected && selectedIds.length > 1 ? selectedIds : [citation.id];
        event.dataTransfer.setData(CITATION_DRAG_TYPE, JSON.stringify(ids));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(event) => {
        const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
        actions.selectCitation(citation.id, mode, visibleIds);
      }}
      className={cn(
        'group/row flex cursor-default items-center gap-3 border-b border-border px-4 py-2.5 text-sm hover:bg-accent/50',
        selected && 'bg-accent/70',
        inspectingId === citation.id && !selected && 'bg-accent/40',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select ${citation.csl.title ?? 'untitled reference'}`}
        onClick={(event) => event.stopPropagation()}
        onChange={() => actions.selectCitation(citation.id, 'toggle', visibleIds)}
        className="h-3.5 w-3.5 shrink-0 rounded border-input"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {citation.favorite === 1 && (
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Favourite" />
          )}
          <span className="truncate font-medium">{citation.csl.title ?? 'Untitled reference'}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{byline}</span>
          {citation.csl['container-title'] && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate italic">{String(citation.csl['container-title'])}</span>
            </>
          )}
          {inText && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 font-mono text-[11px]">{toPlainText(inText)}</span>
            </>
          )}
        </div>
      </div>

      <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground sm:block">
        {typeLabel(citation.type)}
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {year || '—'}
      </span>

      <div className="flex w-16 shrink-0 justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
          aria-label="Edit reference"
          onClick={() => actions.openDialog({ kind: 'manual-entry', citationId: citation.id })}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>

        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
              aria-label={`Options for ${citation.csl.title ?? 'reference'}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => void copyCitation()}>
              <Copy className="h-3.5 w-3.5" /> Copy in-text citation
            </MenuItem>
            <MenuItem onSelect={() => void actions.toggleFavorite(citation.id)}>
              <Star className="h-3.5 w-3.5" />
              {citation.favorite ? 'Remove favourite' : 'Mark favourite'}
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive onSelect={() => void remove()}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  );
}
