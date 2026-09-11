import { useLibraryState } from '@/state';

/**
 * Placeholder shell. Step 4 replaces this with the real layout:
 * `<Sidebar/>` (projects + folder tree), `<CitationTable/>`, `<AutociteBar/>`
 * and the manual-entry dialog. What matters now is that the database opens,
 * the provider bootstraps a project, and failures are legible.
 */
export default function App() {
  const { status, activeProjectId } = useLibraryState();

  if (status.state === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Opening your library…
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">OpenCite cannot start</h1>
        <p className="text-sm text-muted-foreground">{status.message}</p>
      </div>
    );
  }

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">OpenCite</h1>
      <p className="text-sm text-muted-foreground">
        Local library ready. Active project:{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{activeProjectId}</code>
      </p>
      <p className="text-xs text-muted-foreground">
        Step 1 scaffolding — the interface arrives in Step 4.
      </p>
    </main>
  );
}
