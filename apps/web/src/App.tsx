import { STYLE_CATALOG } from '@/citation';
import { AutociteBar } from '@/components/AutociteBar';
import { BibliographyView } from '@/components/Bibliography';
import { useActiveProject, useCitations, useLibraryActions, useLibraryState } from '@/state';
import { SAMPLE_REFERENCES } from '@/lib/sampleData';

/**
 * Development shell. Step 4 replaces this with the real layout — sidebar,
 * citation table, Autocite bar. Until then it exercises the parts that exist:
 * switching styles refetches and reformats, and the result is cached.
 */
export default function App() {
  const { status } = useLibraryState();
  const project = useActiveProject();
  const citations = useCitations();
  const actions = useLibraryActions();

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

  const addSamples = async () => {
    for (const sample of SAMPLE_REFERENCES) {
      await actions.addCitation(sample, { allowDuplicate: true });
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">OpenCite</h1>
        <p className="text-sm text-muted-foreground">
          Step 3 — paste a URL, DOI or ISBN and the metadata is fetched for you. The real
          interface arrives in Step 4.
        </p>
      </header>

      <AutociteBar />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="style-picker" className="text-xs font-medium text-muted-foreground">
            Citation style
          </label>
          <select
            id="style-picker"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={project?.styleId ?? 'apa'}
            onChange={(event) => {
              if (project) void actions.setProjectStyle(project.id, event.target.value);
            }}
          >
            {STYLE_CATALOG.map((style) => (
              <option key={style.id} value={style.id}>
                {style.shortTitle ?? style.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="locale-picker" className="text-xs font-medium text-muted-foreground">
            Language
          </label>
          <select
            id="locale-picker"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={project?.localeId ?? 'en-US'}
            onChange={(event) => {
              if (project) {
                void actions.setProjectStyle(project.id, project.styleId, event.target.value);
              }
            }}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="de-DE">German</option>
            <option value="fr-FR">French</option>
          </select>
        </div>

        {citations.length === 0 && (
          <button
            type="button"
            onClick={() => void addSamples()}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Add sample references
          </button>
        )}
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <BibliographyView />
      </section>

      <p className="text-xs text-muted-foreground">
        {citations.length} reference{citations.length === 1 ? '' : 's'} in this project ·
        styles are fetched from the CSL repository and cached in your browser.
      </p>
    </main>
  );
}
