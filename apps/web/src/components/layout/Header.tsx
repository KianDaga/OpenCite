import { useEffect, useState } from 'react';
import {
  Download,
  FileText,
  Menu as MenuIcon,
  Moon,
  PanelLeft,
  Redo2,
  Settings2,
  Share2,
  Sun,
  Undo2,
} from 'lucide-react';
import { findStyle } from '@/citation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { toPlainText } from '@/citation';
import { useBibliography } from '@/citation';
import {
  resolveTheme,
  useActiveProject,
  useAppearance,
  useCitations,
  useLibraryActions,
  useLibraryState,
} from '@/state';
import { cn } from '@/lib/utils';

/**
 * The top bar: what project you are in, and everything that acts on the whole
 * of it.
 */
export function Header({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const project = useActiveProject();
  const citations = useCitations();
  const actions = useLibraryActions();
  const { sidebarCollapsed } = useLibraryState();
  const { theme, toggleTheme } = useAppearance();
  const { toast } = useToast();

  const style = project ? findStyle(project.styleId) : undefined;
  const dark = resolveTheme(theme) === 'dark';

  // `canUndo` reads a ref, so it does not re-render on its own; a tick after
  // every action keeps the buttons' enabled state honest.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const rename = async () => {
    if (!project) return;
    const name = window.prompt('Project name', project.name);
    if (name?.trim()) await actions.renameProject(project.id, name.trim());
  };

  return (
    <header className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-2 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open projects and folders"
        onClick={onOpenDrawer}
      >
        <MenuIcon className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={dark ? 'Light theme' : 'Dark theme'}
        onClick={toggleTheme}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        aria-label={sidebarCollapsed ? 'Show the sidebar' : 'Hide the sidebar'}
        aria-pressed={sidebarCollapsed}
        title={sidebarCollapsed ? 'Show the sidebar' : 'Hide the sidebar'}
        onClick={() => actions.toggleSidebar()}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />

      <Button
        variant="ghost"
        size="icon"
        aria-label="Undo"
        title="Undo (⌘Z)"
        disabled={!actions.canUndo()}
        onClick={() => void actions.undo()}
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
        disabled={!actions.canRedo()}
        onClick={() => void actions.redo()}
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <button
        type="button"
        onClick={() => void rename()}
        title="Rename this project"
        className="mx-1 flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-sm font-medium hover:bg-accent"
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{project?.name ?? 'OpenCite'}</span>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => actions.openDialog({ kind: 'style-picker' })}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="max-w-[9rem] truncate">
            {style?.shortTitle ?? project?.styleId ?? 'Style'}
          </span>
        </Button>

        <ShareButton disabled={citations.length === 0} onCopied={() => toast('Bibliography copied.')} />

        <Button
          size="sm"
          disabled={citations.length === 0}
          onClick={() => actions.openDialog({ kind: 'export' })}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download References</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </div>
    </header>
  );
}

/**
 * Share, for an app with no server.
 *
 * MyBib shares a link to a project it stores for you. OpenCite stores nothing,
 * so there is no link to give — what a person actually wants to hand over is
 * the formatted bibliography, and the system share sheet is the shortest path
 * to wherever it is going. Where that is unavailable, it copies.
 */
function ShareButton({ disabled, onCopied }: { disabled: boolean; onCopied: () => void }) {
  const state = useBibliography();
  const project = useActiveProject();
  const { toast } = useToast();

  const share = async () => {
    const entries = state.result?.entries ?? [];
    if (entries.length === 0) return;

    const text = entries.map(toPlainText).join('\n\n');
    const title = `${project?.name ?? 'Bibliography'} — ${state.result?.styleTitle ?? ''}`.trim();

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (error) {
        // A cancelled share sheet is not a failure; fall through to copying
        // only if it actually failed.
        if ((error as Error).name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      onCopied();
    } catch {
      toast('Could not share — your browser blocked clipboard access.', { tone: 'destructive' });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => void share()}
      className={cn('hidden sm:inline-flex')}
    >
      <Share2 className="h-3.5 w-3.5" />
      Share
    </Button>
  );
}
