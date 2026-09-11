import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Files,
  Folder,
  FolderPlus,
  Inbox,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { ROOT } from '@opencite/shared';
import type { FolderNode } from '@/db/repositories';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toaster';
import {
  useFolderTree,
  useLibraryActions,
  useLibraryState,
  useProjects,
  useTrash,
} from '@/state';
import { cn } from '@/lib/utils';

/**
 * Projects, folders and the trash.
 *
 * Folders are a drop target: dragging rows from the table onto one files them,
 * which is the fastest way to organise a pile of references and is why the
 * schema carries a folder id per citation rather than a tag.
 */
export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called after a destination is chosen, so the phone drawer can close. */
  onNavigate?: () => void;
}) {
  const projects = useProjects();
  const { activeProjectId, activeFolderId, view } = useLibraryState();
  const actions = useLibraryActions();
  const { tree, unfiled, total } = useFolderTree();
  const trash = useTrash();
  const { toast } = useToast();

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const addProject = async () => {
    await actions.createProject({ name: 'New project' });
    toast('Project created.');
  };

  const deleteProject = async (id: string, name: string) => {
    await actions.deleteProject(id);
    toast(`“${name}” moved to trash.`, {
      action: { label: 'Undo', onClick: () => actions.undo() },
    });
  };

  const renameProject = async (id: string, current: string) => {
    const name = window.prompt('Project name', current);
    if (name?.trim()) await actions.renameProject(id, name.trim());
  };

  return (
    <nav
      className={cn('flex w-64 shrink-0 flex-col border-r border-border bg-secondary/40', className)}
      aria-label="Projects and folders"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-sm font-semibold tracking-tight">OpenCite</span>
        <Button variant="ghost" size="icon" onClick={() => void addProject()} title="Create project">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Create project</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Projects
        </p>

        <ul className="flex flex-col gap-0.5">
          {projects.map((project) => (
            <li key={project.id} className="group/project relative">
              <button
                type="button"
                onClick={() => {
                  actions.selectProject(project.id);
                  onNavigate?.();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 pr-8 text-left text-sm hover:bg-accent',
                  project.id === activeProjectId && 'bg-accent font-medium',
                )}
              >
                <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{project.name}</span>
              </button>

              <Menu>
                <MenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/project:opacity-100"
                    aria-label={`Options for ${project.name}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuItem onSelect={() => void renameProject(project.id, project.name)}>
                    Rename
                  </MenuItem>
                  <MenuItem onSelect={() => void actions.duplicateProject(project.id)}>
                    Duplicate
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    destructive
                    disabled={projects.length === 1}
                    onSelect={() => void deleteProject(project.id, project.name)}
                  >
                    Delete project
                  </MenuItem>
                </MenuContent>
              </Menu>
            </li>
          ))}
        </ul>

        {activeProject && (
          <>
            <div className="flex items-center justify-between px-2 pb-1 pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Folders
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                // "New folder" would collide with the name of the folder this
                // creates, leaving two controls in one region indistinguishable
                // to a screen reader.
                title="Create folder"
                onClick={() => void actions.createFolder({})}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span className="sr-only">Create folder</span>
              </Button>
            </div>

            <ul className="flex flex-col gap-0.5">
              <FolderLink
                icon={<Files className="h-4 w-4 shrink-0 text-muted-foreground" />}
                label="All references"
                count={total}
                active={activeFolderId === undefined}
                onSelect={() => {
                  actions.selectFolder(undefined);
                  onNavigate?.();
                }}
              />
              <FolderLink
                icon={<Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />}
                label="Unfiled"
                count={unfiled}
                active={activeFolderId === ROOT}
                onSelect={() => {
                  actions.selectFolder(ROOT);
                  onNavigate?.();
                }}
                onDropCitations={(ids) => void actions.moveCitations(ids, { folderId: ROOT })}
              />

              {tree.map((node) => (
                <FolderBranch key={node.id} node={node} depth={0} onNavigate={onNavigate} />
              ))}
            </ul>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          actions.setView('trash');
          onNavigate?.();
        }}
        className={cn(
          'flex items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent',
          view === 'trash' && 'bg-accent font-medium text-foreground',
        )}
      >
        <Trash2 className="h-4 w-4" />
        <span>Trash</span>
        {trash.length > 0 && <span className="ml-auto text-xs">{trash.length}</span>}
      </button>
    </nav>
  );
}

function FolderLink({
  icon,
  label,
  count,
  active,
  depth = 0,
  onSelect,
  onDropCitations,
  trailing,
  expander,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  depth?: number;
  onSelect: () => void;
  onDropCitations?: (ids: string[]) => void;
  trailing?: React.ReactNode;
  expander?: React.ReactNode;
}) {
  const [dropTarget, setDropTarget] = useState(false);

  return (
    <li className="group/folder relative">
      <div
        onDragOver={(event) => {
          if (!onDropCitations) return;
          event.preventDefault();
          setDropTarget(true);
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(event) => {
          if (!onDropCitations) return;
          event.preventDefault();
          setDropTarget(false);
          const raw = event.dataTransfer.getData('application/x-opencite-citations');
          if (!raw) return;
          try {
            onDropCitations(JSON.parse(raw) as string[]);
          } catch {
            // A drag from somewhere else; nothing to file.
          }
        }}
        className={cn('rounded', dropTarget && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}
      >
        <button
          type="button"
          onClick={onSelect}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          className={cn(
            'flex w-full items-center gap-2 rounded py-1.5 pr-8 text-left text-sm hover:bg-accent',
            active && 'bg-accent font-medium',
          )}
        >
          {expander ?? <span className="w-0" />}
          {icon}
          <span className="truncate">{label}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
          )}
        </button>
      </div>
      {trailing}
    </li>
  );
}

function FolderBranch({
  node,
  depth,
  onNavigate,
}: {
  node: FolderNode;
  depth: number;
  onNavigate?: () => void;
}) {
  const { activeFolderId } = useLibraryState();
  const actions = useLibraryActions();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);

  const rename = async () => {
    const name = window.prompt('Folder name', node.name);
    if (name?.trim()) await actions.renameFolder(node.id, name.trim());
  };

  const remove = async () => {
    await actions.deleteFolder(node.id, 'unfile');
    toast(`“${node.name}” deleted. Its references were unfiled.`, {
      action: { label: 'Undo', onClick: () => actions.undo() },
    });
  };

  return (
    <>
      <FolderLink
        depth={depth}
        icon={<Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
        label={node.name}
        count={node.count}
        active={activeFolderId === node.id}
        onSelect={() => {
          actions.selectFolder(node.id);
          onNavigate?.();
        }}
        onDropCitations={(ids) => void actions.moveCitations(ids, { folderId: node.id })}
        expander={
          node.children.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  setExpanded((value) => !value);
                }
              }}
              className="-ml-1 text-muted-foreground"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          ) : undefined
        }
        trailing={
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/folder:opacity-100"
                aria-label={`Options for ${node.name}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem onSelect={() => void rename()}>Rename</MenuItem>
              <MenuItem onSelect={() => void actions.createFolder({ parentId: node.id })}>
                New subfolder
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => void remove()}>
                Delete folder
              </MenuItem>
            </MenuContent>
          </Menu>
        }
      />

      {expanded &&
        node.children.map((child) => (
          <FolderBranch key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
        ))}
    </>
  );
}

/** The MIME type rows use when dragged onto a folder. */
export const CITATION_DRAG_TYPE = 'application/x-opencite-citations';
