import { useEffect, useState } from 'react';
import { Check, Copy, Quote, Table2, X } from 'lucide-react';
import { toPlainText, useBibliography } from '@/citation';
import { AutociteBar } from '@/components/AutociteBar';
import { BibliographyView } from '@/components/Bibliography';
import { ExportDialog } from '@/components/dialogs/ExportDialog';
import { ImportDialog } from '@/components/dialogs/ImportDialog';
import { ManualEntryDialog } from '@/components/dialogs/ManualEntryDialog';
import { StylePickerDialog } from '@/components/dialogs/StylePickerDialog';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { CitationTable } from '@/components/table/CitationTable';
import { Toolbar } from '@/components/table/Toolbar';
import { TrashView } from '@/components/table/TrashView';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { useAppearance, useCitations, useLibraryActions, useLibraryState, useThemeEffect } from '@/state';
import { cn } from '@/lib/utils';
import { FormatBar } from './FormatBar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';

/**
 * The application layout: projects on the left, the working list on the right.
 *
 * References and Bibliography are tabs rather than two panes because they are
 * the same data answering different questions — "what do I have" versus "what
 * does it look like" — and a split view would halve both.
 */
export function AppShell() {
  const citations = useCitations();
  const actions = useLibraryActions();
  const { selectedIds, view, sidebarCollapsed } = useLibraryState();
  const { theme } = useAppearance();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useThemeEffect(theme);
  useHistoryShortcuts();

  return (
    <div className="flex h-full min-h-0">
      <Sidebar className={cn('hidden md:flex', sidebarCollapsed && 'md:hidden')} />

      {/* Below md the sidebar is a drawer — without it there is no way to
          reach projects, folders or the trash on a phone at all. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="relative z-10 flex h-full">
            <Sidebar className="flex bg-background" onNavigate={() => setDrawerOpen(false)} />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 text-muted-foreground"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <Header onOpenDrawer={() => setDrawerOpen(true)} />

        <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
          {citations.length === 0 && view !== 'trash' && (
            <p className="text-center font-serif text-lg font-medium tracking-tight sm:text-xl">
              <span aria-hidden className="mx-2 text-muted-foreground">
                ↓
              </span>
              Generate your first citation
              <span aria-hidden className="mx-2 text-muted-foreground">
                ↓
              </span>
            </p>
          )}
          <AutociteBar />
          <FormatBar />
        </div>

        <div className="flex items-center gap-1 border-b border-border px-3">
          <TabButton active={view === 'references'} onClick={() => actions.setView('references')}>
            <Table2 className="h-3.5 w-3.5" />
            References
            <span className="tabular-nums text-muted-foreground">{citations.length}</span>
          </TabButton>
          <TabButton active={view === 'bibliography'} onClick={() => actions.setView('bibliography')}>
            <Quote className="h-3.5 w-3.5" />
            Bibliography
          </TabButton>
        </div>

        {view === 'references' && (
          <>
            <Toolbar />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CitationTable />
            </div>
          </>
        )}
        {view === 'bibliography' && <BibliographyPanel />}
        {view === 'trash' && <TrashView />}

        <StatusBar />
      </main>

      <ManualEntryDialog />
      <StylePickerDialog />
      <ExportDialog />
      <ImportDialog />

      {/* Announced so the count is available without watching the toolbar. */}
      <p className="sr-only" aria-live="polite">
        {selectedIds.length} references selected
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
        active && 'border-primary font-medium text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** The formatted bibliography, with the copy actions that make it useful. */
function BibliographyPanel() {
  const state = useBibliography();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const entries = state.result?.entries ?? [];

  const copy = async (asHtml: boolean) => {
    if (entries.length === 0) return;
    const html = `<div class="csl-bib-body">${entries.join('')}</div>`;
    const text = entries.map(toPlainText).join('\n\n');

    try {
      if (asHtml && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        // Rich text keeps the italics a bibliography depends on when it is
        // pasted into a word processor.
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast(asHtml ? 'Bibliography copied with formatting.' : 'Bibliography copied as plain text.');
    } catch {
      toast('Could not copy — your browser blocked clipboard access.', { tone: 'destructive' });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Button size="sm" variant="outline" disabled={entries.length === 0} onClick={() => void copy(true)}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy bibliography
        </Button>
        <Button size="sm" variant="ghost" disabled={entries.length === 0} onClick={() => void copy(false)}>
          Copy as plain text
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{state.result?.styleTitle}</span>
      </div>

      <div className="px-6 py-6">
        <BibliographyView />
      </div>
    </div>
  );
}

/**
 * ⌘Z and ⇧⌘Z anywhere outside a text field. Inside one they belong to the
 * field's own history.
 */
function useHistoryShortcuts() {
  const actions = useLibraryActions();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || !(event.metaKey || event.ctrlKey)) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing) return;

      if (event.shiftKey) {
        if (!actions.canRedo()) return;
        event.preventDefault();
        void actions.redo();
      } else {
        if (!actions.canUndo()) return;
        event.preventDefault();
        void actions.undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);
}
