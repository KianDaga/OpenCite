import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSLItem, Citation } from '@opencite/shared';
import { fontStackFor, useActiveProject, useAppearance, useCitations } from '@/state';
import { CSLFetchError } from './styleRegistry';
import {
  renderBibliography,
  renderCitation,
  renderCitations,
  type BibliographyResult,
} from './engine';

/**
 * Formatting is asynchronous (the style may still be downloading) while
 * rendering is not, so the result is held in state and recomputed by effect.
 *
 * Two things keep that honest: a signature string so a live-query re-run that
 * produced identical data does not re-render the bibliography, and a
 * generation counter so a slow style resolving late cannot overwrite the
 * result of a newer one.
 */

export type BibliographyStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BibliographyState {
  result: BibliographyResult | null;
  status: BibliographyStatus;
  /** Human-readable, already safe to put in front of a user. */
  error: string | null;
}

/** Changes only when something that affects the output changes. */
function signature(items: Citation[], styleId: string, localeId: string): string {
  const rows = items.map((c) => `${c.id}@${c.updatedAt}`).join(',');
  return `${styleId}|${localeId}|${rows}`;
}

function describe(error: unknown): string {
  if (error instanceof CSLFetchError) {
    return 'That citation style could not be downloaded. Check your connection, or pick another style.';
  }
  if (error instanceof Error && error.message) {
    return `The bibliography could not be formatted: ${error.message}`;
  }
  return 'The bibliography could not be formatted.';
}

export function useBibliographyFor(
  items: Citation[],
  styleId: string | undefined,
  localeId: string | undefined,
): BibliographyState {
  const [state, setState] = useState<BibliographyState>({
    result: null,
    status: 'idle',
    error: null,
  });

  const generation = useRef(0);
  const key = styleId && localeId ? signature(items, styleId, localeId) : null;

  // Read through a ref: `items` is a fresh array on every live-query run, but
  // `key` already captures whether its contents actually changed.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!key || !styleId || !localeId) return;

    const run = (generation.current += 1);
    setState((prev) => ({ ...prev, status: 'loading' }));

    void (async () => {
      try {
        const csl: CSLItem[] = itemsRef.current.map((c) => c.csl);
        const result = await renderBibliography(csl, styleId, localeId);
        if (generation.current !== run) return; // A newer render won.
        setState({ result, status: 'ready', error: null });
      } catch (error) {
        if (generation.current !== run) return;
        setState({ result: null, status: 'error', error: describe(error) });
      }
    })();
  }, [key, styleId, localeId]);

  return state;
}

/** The bibliography for whatever the main table is currently showing. */
export function useBibliography(): BibliographyState {
  const citations = useCitations();
  const project = useActiveProject();
  return useBibliographyFor(citations, project?.styleId, project?.localeId);
}

/** In-text citations (`(Arendt, 1958)`, `[1]`) for the selected references. */
export function useCitationPreview(citation: Citation | undefined): string | null {
  const project = useActiveProject();
  const [text, setText] = useState<string | null>(null);

  const styleId = project?.styleId;
  const localeId = project?.localeId;
  const key = citation && styleId && localeId
    ? `${citation.id}@${citation.updatedAt}|${styleId}|${localeId}`
    : null;

  const cslRef = useRef(citation?.csl);
  cslRef.current = citation?.csl;

  useEffect(() => {
    if (!key || !styleId || !localeId || !cslRef.current) {
      setText(null);
      return;
    }
    let cancelled = false;
    void renderCitation(cslRef.current, styleId, localeId)
      .then((rendered) => {
        if (!cancelled) setText(rendered);
      })
      .catch(() => {
        if (!cancelled) setText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key, styleId, localeId]);

  return text;
}

/**
 * In-text citations for every row currently shown, rendered in one pass.
 *
 * Per-row rendering would label every reference "[1]" under a numeric style,
 * because citeproc numbers from the items registered at the time.
 */
export function useInTextCitations(items: Citation[]): Map<string, string> {
  const project = useActiveProject();
  const [labels, setLabels] = useState<Map<string, string>>(new Map());

  const styleId = project?.styleId;
  const localeId = project?.localeId;
  const key = styleId && localeId ? signature(items, styleId, localeId) : null;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!key || !styleId || !localeId) return;
    let cancelled = false;

    void renderCitations(
      itemsRef.current.map((c) => c.csl),
      styleId,
      localeId,
    )
      .then((result) => {
        if (!cancelled) setLabels(result);
      })
      .catch(() => {
        if (!cancelled) setLabels(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [key, styleId, localeId]);

  return labels;
}

/**
 * Inline styles carrying citeproc's layout metadata onto the container.
 *
 * The style decides whether entries hang or sit in a numbered gutter, so these
 * are data attributes and custom properties rather than fixed CSS classes —
 * `globals.css` reads them.
 */
export function useBibliographyAttributes(state: BibliographyState) {
  const { fontFamily, fontSize } = useAppearance();
  const layout = state.result?.layout;

  return useMemo(() => {
    const typography = {
      fontFamily: fontStackFor(fontFamily),
      fontSize: `${fontSize}pt`,
    };

    if (!layout) {
      return { 'data-hanging-indent': 'false', style: typography as React.CSSProperties };
    }

    return {
      'data-hanging-indent': String(layout.hangingIndent),
      'data-second-field-align': layout.secondFieldAlign || 'none',
      style: {
        ...typography,
        // `maxoffset` is the widest label in characters; `ch` is the unit that
        // matches what citeproc measured.
        '--csl-max-offset': `${Math.max(layout.maxOffset, 1)}ch`,
        '--csl-entry-spacing': `${0.6 + layout.entrySpacing * 0.6}rem`,
        '--csl-line-height': String(Math.max(layout.lineSpacing, 1) * 1.5),
      } as React.CSSProperties,
    };
  }, [layout, fontFamily, fontSize]);
}
