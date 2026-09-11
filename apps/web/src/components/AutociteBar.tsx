import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { LOOKUP_ENABLED, useLookup } from '@/lookup';
import { useLibraryActions } from '@/state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * One box that takes anything: a URL, a DOI, an ISBN, an arXiv id, or just a
 * title. Working out which is the server's job, so the reader never has to
 * pick a category before pasting.
 *
 * On a static deployment there is no server to ask, so the box is replaced by
 * an explanation and the action that does work. Showing a prominent control
 * that fails on every use, and only then explaining why, is the worse of the
 * two designs.
 */
export function AutociteBar({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const { state, search, accept, reset } = useLookup();
  const actions = useLibraryActions();
  const busy = state.status === 'searching';

  if (!LOOKUP_ENABLED) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-secondary/50 px-3 py-2.5',
          className,
        )}
      >
        <p className="min-w-[15rem] flex-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Add references by hand.</span>{' '}
          Automatic lookup needs a server; this build is static. Styles, folders and
          exports all work normally.
        </p>
        <Button size="sm" onClick={() => actions.openDialog({ kind: 'manual-entry' })}>
          <PenLine className="h-3.5 w-3.5" />
          Add a reference
        </Button>
      </div>
    );
  }

  const submit = async () => {
    const query = value.trim();
    if (!query || busy) return;
    await search(query);
    setValue('');
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          id="autocite-query"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste a URL, DOI, ISBN — or type a title"
          aria-label="Paste a URL, DOI, ISBN, or type a title"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Looking up…' : 'Cite'}
        </button>
      </form>

      {(state.error ?? state.message) && (
        <p className="text-sm text-destructive" role="alert">
          {state.error ?? state.message}
        </p>
      )}

      {state.status === 'choosing' && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              No exact match — did you mean one of these?
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-muted-foreground underline"
            >
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
