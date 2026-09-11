import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { LOCALE_CATALOG, STYLE_CATALOG, searchCatalog } from '@/citation';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useActiveProject, useLibraryActions, useLibraryState } from '@/state';
import { cn } from '@/lib/utils';

/**
 * Choosing a style.
 *
 * The shortlist covers most academic writing, but the CSL repository holds
 * ~2,600 styles — so anything not listed can be reached by typing its id.
 * That is deliberately kept possible: a shortlist that cannot be escaped is
 * the thing that sends people to a paid tool.
 */
export function StylePickerDialog() {
  const { dialog } = useLibraryState();
  const project = useActiveProject();
  const actions = useLibraryActions();
  const [query, setQuery] = useState('');

  const open = dialog?.kind === 'style-picker';
  const matches = useMemo(() => (query ? searchCatalog(query) : STYLE_CATALOG), [query]);

  const looksLikeStyleId = /^[a-z0-9][a-z0-9-]{2,}$/.test(query.trim());
  const noCatalogMatch = matches.length === 0 && looksLikeStyleId;

  const choose = async (styleId: string) => {
    if (project) await actions.setProjectStyle(project.id, styleId);
    actions.closeDialog();
    setQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && actions.closeDialog()}>
      <DialogContent className="max-w-xl">
        <div className="flex flex-col gap-1">
          <DialogTitle>Citation style</DialogTitle>
          <DialogDescription>
            {STYLE_CATALOG.length} styles listed. Any other CSL style works too — type its id.
          </DialogDescription>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search styles, or paste a CSL style id"
            aria-label="Search citation styles"
            className="pl-8"
          />
        </div>

        <ul className="-mx-1 flex max-h-[45vh] flex-col overflow-y-auto px-1">
          {matches.map((style) => {
            const active = style.id === project?.styleId;
            return (
              <li key={style.id}>
                <button
                  type="button"
                  onClick={() => void choose(style.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left text-sm hover:bg-accent',
                    active && 'bg-accent',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{style.shortTitle ?? style.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{style.title}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}

          {noCatalogMatch && (
            <li className="px-2 py-3">
              <p className="mb-2 text-sm text-muted-foreground">
                Not in the list. If <code className="rounded bg-muted px-1">{query.trim()}</code> is a
                CSL style id, OpenCite will fetch it.
              </p>
              <Button size="sm" onClick={() => void choose(query.trim())}>
                Use “{query.trim()}”
              </Button>
            </li>
          )}

          {matches.length === 0 && !noCatalogMatch && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
              No styles match that.
            </li>
          )}
        </ul>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <Label htmlFor="locale-select">Language</Label>
          <select
            id="locale-select"
            value={project?.localeId ?? 'en-US'}
            onChange={(event) => {
              if (project) {
                void actions.setProjectStyle(project.id, project.styleId, event.target.value);
              }
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {LOCALE_CATALOG.map((locale) => (
              <option key={locale.id} value={locale.id}>
                {locale.label}
              </option>
            ))}
          </select>
        </div>
      </DialogContent>
    </Dialog>
  );
}
