import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { parseReferences, type ImportResult } from '@/import';
import { useLibraryActions, useLibraryState } from '@/state';

const FORMAT_NAMES: Record<ImportResult['format'], string> = {
  bibtex: 'BibTeX',
  ris: 'RIS',
  'csl-json': 'CSL JSON',
  unknown: 'an unrecognised format',
};

/**
 * Bringing a library in from somewhere else.
 *
 * The format is detected rather than chosen: someone exporting from Zotero or
 * Mendeley knows which button they pressed there, not which of three formats
 * the file happens to be in. A file is read the same way as a paste, because
 * half the time people paste.
 */
export function ImportDialog() {
  const { dialog } = useLibraryState();
  const actions = useLibraryActions();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const open = dialog?.kind === 'import';
  const preview = text.trim() ? parseReferences(text) : null;

  const close = () => {
    setText('');
    actions.closeDialog();
  };

  const readFile = async (file: File) => {
    setText(await file.text());
  };

  const run = async () => {
    if (!preview || preview.items.length === 0) return;
    setBusy(true);
    try {
      const ids = await actions.importCitations(preview.items);
      toast(
        `${ids.length} reference${ids.length === 1 ? '' : 's'} imported` +
          (preview.skipped > 0 ? `, ${preview.skipped} skipped.` : '.'),
      );
      close();
    } catch {
      toast('That import failed. Check the file and try again.', { tone: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-xl">
        <div className="flex flex-col gap-1">
          <DialogTitle>Import references</DialogTitle>
          <DialogDescription>
            BibTeX, RIS or CSL JSON — from Zotero, Mendeley, EndNote, or a LaTeX project.
          </DialogDescription>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".bib,.bibtex,.ris,.json,.txt,text/plain,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            event.target.value = '';
          }}
        />

        <Button variant="outline" className="self-start" onClick={() => fileInput.current?.click()}>
          <Upload className="h-4 w-4" />
          Choose a file
        </Button>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-text">Or paste the file's contents</Label>
          <Textarea
            id="import-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'@article{...}\n\nTY  - JOUR\n...'}
            className="min-h-[9rem] font-mono text-xs"
          />
        </div>

        {preview && (
          <p
            className={
              preview.items.length > 0 ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
            }
            role="status"
          >
            {preview.items.length > 0
              ? `Found ${preview.items.length} reference${preview.items.length === 1 ? '' : 's'} in ${FORMAT_NAMES[preview.format]}` +
                (preview.skipped > 0 ? `, and ${preview.skipped} record${preview.skipped === 1 ? '' : 's'} that could not be read.` : '.')
              : `That does not look like BibTeX, RIS or CSL JSON.`}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy || !preview || preview.items.length === 0} onClick={() => void run()}>
            {busy ? 'Importing…' : `Import${preview?.items.length ? ` ${preview.items.length}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
