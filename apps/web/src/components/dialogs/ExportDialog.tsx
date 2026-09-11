import { useState } from 'react';
import { Download, FileText, Library } from 'lucide-react';
import type { CSLItem } from '@opencite/shared';
import { toPlainText, useBibliographyFor } from '@/citation';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import {
  EXPORT_FORMATS,
  downloadBlob,
  downloadText,
  safeFilename,
  toBibTeX,
  toCSLJSON,
  toDocxBlob,
  toHTMLDocument,
  toRIS,
  type ExportFormat,
} from '@/export';
import {
  useActiveProject,
  useCitations,
  useLibraryActions,
  useLibraryState,
  useSelectedCitations,
} from '@/state';
import { cn } from '@/lib/utils';

/**
 * Export.
 *
 * Bibliography formats and library formats are separated because they answer
 * different needs: one is finished prose in the reader's citation style, the
 * other is the underlying metadata for moving into another tool. A single flat
 * list of file types is what makes people download the wrong one.
 */
export function ExportDialog() {
  const { dialog, selectedIds } = useLibraryState();
  const actions = useLibraryActions();
  const project = useActiveProject();
  const all = useCitations();
  const selected = useSelectedCitations();
  const { toast } = useToast();

  const open = dialog?.kind === 'export';
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const citations = scope === 'selected' && selected.length > 0 ? selected : all;
  const items: CSLItem[] = citations.map((c) => c.csl);

  // Bibliography formats need the rendered output, so the same engine and
  // style that drive the on-screen view drive the file.
  const bibliography = useBibliographyFor(citations, project?.styleId, project?.localeId);
  const entries = bibliography.result?.entries ?? [];

  const run = async (format: ExportFormat) => {
    const name = project?.name ?? 'bibliography';
    setBusy(format.id);

    try {
      switch (format.id) {
        case 'bibtex':
          downloadText(toBibTeX(items), safeFilename(name, 'bib'), format.mimeType);
          break;
        case 'ris':
          downloadText(toRIS(items), safeFilename(name, 'ris'), format.mimeType);
          break;
        case 'csl-json':
          downloadText(toCSLJSON(items), safeFilename(name, 'json'), format.mimeType);
          break;
        case 'text':
          downloadText(
            entries.map(toPlainText).join('\n\n'),
            safeFilename(name, 'txt'),
            format.mimeType,
          );
          break;
        case 'html':
          downloadText(
            toHTMLDocument(entries, {
              title: name,
              ...(bibliography.result?.styleTitle ? { styleTitle: bibliography.result.styleTitle } : {}),
              ...(bibliography.result?.layout ? { layout: bibliography.result.layout } : {}),
            }),
            safeFilename(name, 'html'),
            format.mimeType,
          );
          break;
        case 'docx': {
          const blob = await toDocxBlob(entries, {
            title: name,
            ...(bibliography.result?.styleTitle ? { styleTitle: bibliography.result.styleTitle } : {}),
            ...(bibliography.result?.layout ? { layout: bibliography.result.layout } : {}),
          });
          downloadBlob(blob, safeFilename(name, 'docx'));
          break;
        }
      }

      toast(`${citations.length} reference${citations.length === 1 ? '' : 's'} exported as ${format.label}.`);
      actions.closeDialog();
    } catch {
      toast(`That ${format.label} export failed. Please try again.`, { tone: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const bibliographyNotReady = bibliography.status === 'loading' || entries.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && actions.closeDialog()}>
      <DialogContent className="max-w-lg">
        <div className="flex flex-col gap-1">
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Everything here is free and unlimited — no watermark, no sign-up.
          </DialogDescription>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1 rounded-md bg-secondary p-1 text-sm">
            <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
              All {all.length}
            </ScopeButton>
            <ScopeButton active={scope === 'selected'} onClick={() => setScope('selected')}>
              Selected {selectedIds.length}
            </ScopeButton>
          </div>
        )}

        <Section
          icon={<FileText className="h-3.5 w-3.5" />}
          title="Bibliography"
          subtitle={`Formatted in ${bibliography.result?.styleTitle ?? project?.styleId ?? 'your style'}`}
        >
          {EXPORT_FORMATS.filter((f) => f.family === 'bibliography').map((format) => (
            <FormatRow
              key={format.id}
              format={format}
              busy={busy === format.id}
              disabled={bibliographyNotReady}
              onClick={() => void run(format)}
            />
          ))}
        </Section>

        <Section
          icon={<Library className="h-3.5 w-3.5" />}
          title="Library"
          subtitle="The metadata itself, for another reference manager"
        >
          {EXPORT_FORMATS.filter((f) => f.family === 'library').map((format) => (
            <FormatRow
              key={format.id}
              format={format}
              busy={busy === format.id}
              disabled={items.length === 0}
              onClick={() => void run(format)}
            />
          ))}
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function ScopeButton({
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
      aria-pressed={active}
      className={cn(
        'flex-1 rounded px-3 py-1 text-center text-sm transition-colors',
        active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function FormatRow({
  format,
  busy,
  disabled,
  onClick,
}: {
  format: ExportFormat;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{format.label}</span>
        <span className="block text-xs text-muted-foreground">{format.description}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {busy ? 'Preparing…' : <Download className="h-4 w-4" />}
      </span>
    </button>
  );
}
