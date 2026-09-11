import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Keyboard, Search, Upload } from 'lucide-react';
import type { CSLItemType } from '@opencite/shared';
import { useLookup } from '@/lookup';
import { useLibraryActions } from '@/state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The bar that turns anything into a citation.
 *
 * The tabs do not change *how* the input is resolved — that is worked out from
 * the text itself — they set expectations and give the right example. Someone
 * on the Book tab is told to paste an ISBN; someone on Journal, a DOI. Pasting
 * a DOI while the Book tab is selected still works, because the alternative is
 * an error message telling a person something they pasted was in the wrong
 * box.
 *
 * What the tab does change is the fallback: when a title search is needed,
 * "Book" narrows it to books rather than searching everything.
 */

export interface CiteTab {
  id: string;
  label: string;
  icon: string;
  placeholder: string;
  /** Reference type used when the tab falls through to manual entry. */
  manualType: CSLItemType;
}

export const CITE_TABS: CiteTab[] = [
  {
    id: 'website',
    label: 'Website',
    icon: '🌐',
    placeholder: 'Enter or paste a URL (web page address)',
    manualType: 'webpage',
  },
  {
    id: 'book',
    label: 'Book',
    icon: '📚',
    placeholder: 'Enter a book title, author, or ISBN',
    manualType: 'book',
  },
  {
    id: 'journal',
    label: 'Journal',
    icon: '📔',
    placeholder: 'Enter an article title, author, or DOI',
    manualType: 'article-journal',
  },
  {
    id: 'preformatted',
    label: 'Pre-formatted',
    icon: '📋',
    placeholder: 'Paste BibTeX, RIS or CSL JSON to import',
    manualType: 'document',
  },
];

export const MORE_TABS: CiteTab[] = [
  { id: 'newspaper', label: 'Newspaper', icon: '📰', placeholder: 'Enter an article title, author, or URL', manualType: 'article-newspaper' },
  { id: 'chapter', label: 'Book chapter', icon: '📖', placeholder: 'Enter a chapter or book title, or ISBN', manualType: 'chapter' },
  { id: 'thesis', label: 'Thesis', icon: '🎓', placeholder: 'Enter a thesis title, author, or DOI', manualType: 'thesis' },
  { id: 'report', label: 'Report', icon: '📊', placeholder: 'Enter a report title or DOI', manualType: 'report' },
  { id: 'film', label: 'Film or video', icon: '🎬', placeholder: 'Enter a title or URL', manualType: 'motion_picture' },
  { id: 'dataset', label: 'Dataset', icon: '🗄️', placeholder: 'Enter a dataset title or DOI', manualType: 'dataset' },
  { id: 'software', label: 'Software', icon: '💻', placeholder: 'Enter a name, version, or DOI', manualType: 'software' },
];

export function AutociteBar({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const [tabId, setTabId] = useState('website');
  const [moreOpen, setMoreOpen] = useState(false);
  const { state, search, accept, reset } = useLookup();
  const actions = useLibraryActions();
  const inputRef = useRef<HTMLInputElement>(null);

  const allTabs = [...CITE_TABS, ...MORE_TABS];
  const tab = allTabs.find((t) => t.id === tabId) ?? CITE_TABS[0]!;
  const busy = state.status === 'searching';
  const inMore = MORE_TABS.some((t) => t.id === tabId);

  // The pre-formatted tab is an import, not a lookup.
  useEffect(() => {
    if (tabId === 'preformatted') actions.openDialog({ kind: 'import' });
  }, [tabId, actions]);

  const submit = async () => {
    const query = value.trim();
    if (!query || busy) return;
    await search(query, tab.manualType);
    setValue('');
  };

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setValue(text);
      inputRef.current?.focus();
    } catch {
      // Clipboard read needs permission and a user gesture; if it is refused
      // the field is still there to paste into by hand.
      inputRef.current?.focus();
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-end gap-x-1 gap-y-1">
        <span className="mb-1.5 mr-1 font-serif text-sm italic text-muted-foreground">Cite a:</span>

        {CITE_TABS.map((entry) => (
          <TabButton
            key={entry.id}
            active={tabId === entry.id}
            onClick={() => setTabId(entry.id)}
            icon={entry.icon}
          >
            {entry.label}
          </TabButton>
        ))}

        <div className="relative">
          <TabButton
            active={inMore}
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
          >
            {inMore ? tab.label : 'More'}
            <span aria-hidden className="text-[10px]">
              ▾
            </span>
          </TabButton>

          {moreOpen && (
            <>
              {/* Click-away target, so the menu closes like a menu should. */}
              <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} aria-hidden />
              <ul className="absolute left-0 top-full z-20 mt-1 min-w-[12rem] rounded-md border border-border bg-popover p-1 shadow-md">
                {MORE_TABS.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTabId(entry.id);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span aria-hidden>{entry.icon}</span>
                      {entry.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <form
        className="flex items-center gap-1 rounded-lg border border-input bg-background p-1 focus-within:ring-2 focus-within:ring-ring"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          id="autocite-query"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={tab.placeholder}
          aria-label={tab.placeholder}
          className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />

        <IconButton label="Paste from clipboard" onClick={() => void pasteFromClipboard()}>
          <ClipboardPaste className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Enter details by hand"
          onClick={() =>
            actions.openDialog({ kind: 'manual-entry', prefill: { type: tab.manualType } })
          }
        >
          <Keyboard className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Import from a file"
          onClick={() => actions.openDialog({ kind: 'import' })}
        >
          <Upload className="h-4 w-4" />
        </IconButton>

        <Button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="h-9 shrink-0 bg-emerald-600 text-white hover:bg-emerald-600/90"
        >
          <Search className="h-4 w-4" />
          {busy ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {(state.error ?? state.message) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
          <span>{state.error ?? state.message}</span>
          {state.status === 'error' && state.query && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                actions.openDialog({
                  kind: 'manual-entry',
                  prefill: {
                    type: tab.manualType,
                    ...(/^https?:/i.test(state.query) ? { URL: state.query } : { title: state.query }),
                  },
                });
                reset();
              }}
            >
              Enter it by hand
            </Button>
          )}
        </div>
      )}

      {state.status === 'choosing' && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              No exact match — did you mean one of these?
            </p>
            <button type="button" onClick={reset} className="text-xs text-muted-foreground underline">
              Dismiss
            </button>
          </div>

          <ul className="flex flex-col gap-1">
            {state.candidates.map((candidate) => (
              <li key={candidate.csl.id}>
                <button
                  type="button"
                  onClick={() => void accept(candidate, state.query)}
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">{candidate.csl.title ?? 'Untitled'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[
                      candidate.csl.author?.[0]?.family ?? candidate.csl.author?.[0]?.literal,
                      candidate.csl.issued?.['date-parts']?.[0]?.[0],
                      candidate.csl['container-title'],
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
        active && 'border-primary bg-accent/60 font-medium text-foreground',
      )}
      {...rest}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="shrink-0 text-muted-foreground"
    >
      {children}
    </Button>
  );
}
