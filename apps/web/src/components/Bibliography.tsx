import { cn } from '@/lib/utils';
import {
  useBibliography,
  useBibliographyAttributes,
  type BibliographyState,
} from '@/citation';

/**
 * Renders citeproc's output.
 *
 * The HTML comes from citeproc, not from user input — it is generated from
 * CSL-JSON by the formatter, which emits a fixed set of tags (`i`, `b`,
 * `span`, `div`) and escapes everything it interpolates. That is what makes
 * `dangerouslySetInnerHTML` the right call here rather than a shortcut.
 */
export function BibliographyView({ className }: { className?: string }) {
  const state = useBibliography();
  return <BibliographyBody state={state} className={className} />;
}

export function BibliographyBody({
  state,
  className,
}: {
  state: BibliographyState;
  className?: string;
}) {
  const attributes = useBibliographyAttributes(state);

  if (state.status === 'error') {
    return (
      <p className={cn('text-sm text-destructive', className)} role="alert">
        {state.error}
      </p>
    );
  }

  if (state.status === 'loading' && !state.result) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>Formatting references…</p>
    );
  }

  if (!state.result || state.result.entries.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No references yet. Paste a URL, DOI or ISBN to add one.
      </p>
    );
  }

  return (
    <div
      className={cn('csl-bib-body', state.status === 'loading' && 'opacity-60', className)}
      // Formatting runs off the render path, so announce the swap for
      // screen readers rather than letting entries change silently.
      aria-busy={state.status === 'loading'}
      {...attributes}
    >
      {state.result.entries.map((entry, index) => (
        <div
          key={state.result!.ids[index] ?? index}
          // citeproc already emits each entry wrapped in `.csl-entry`;
          // `display: contents` keeps this keying wrapper out of the layout.
          style={{ display: 'contents' }}
          dangerouslySetInnerHTML={{ __html: entry }}
        />
      ))}
    </div>
  );
}
