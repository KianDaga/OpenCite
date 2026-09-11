import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { formatNameForDisplay, issuedYear } from '@/lib/derive';
import { useLibraryActions, useTrash } from '@/state';

/**
 * Deleted references, and the way back.
 *
 * Deletes are soft, so this is the whole point of that: nothing leaves until
 * someone empties the trash, and until then every delete is reversible without
 * a backup or an undo history that expires.
 */
export function TrashView() {
  const trashed = useTrash();
  const actions = useLibraryActions();
  const { toast } = useToast();

  const emptyTrash = async () => {
    const count = trashed.length;
    if (!window.confirm(`Permanently delete ${count} reference${count === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }
    await actions.emptyTrash();
    toast(`${count} reference${count === 1 ? '' : 's'} permanently deleted.`, { tone: 'destructive' });
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">Trash</span>
        <span className="text-xs text-muted-foreground">
          {trashed.length === 0
            ? 'Nothing deleted'
            : `${trashed.length} reference${trashed.length === 1 ? '' : 's'}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive"
          disabled={trashed.length === 0}
          onClick={() => void emptyTrash()}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Empty trash
        </Button>
      </div>

      {trashed.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">
          Deleted references wait here until you empty the trash.
        </p>
      ) : (
        <ul>
          {trashed.map((citation) => (
            <li
              key={citation.id}
              className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{citation.csl.title ?? 'Untitled reference'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {(citation.csl.author ?? []).slice(0, 2).map(formatNameForDisplay).join(', ') || 'No author'}
                  {issuedYear(citation.csl) && ` · ${issuedYear(citation.csl)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void actions.restoreCitations([citation.id]);
                  toast('Reference restored.');
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
