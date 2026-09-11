import type { BibliographyMeta, CitationItem, CiteprocSys, Engine } from 'citeproc';
import type { CSLItem } from '@opencite/shared';
import { FALLBACK_LOCALE, preloadLocales, resolveStyle } from './styleRegistry';

/**
 * The citeproc-js adapter.
 *
 * citeproc's `sys` callbacks are synchronous — it asks for an item or a locale
 * in the middle of rendering and cannot wait. So this module is split in two:
 * an async *preparation* phase that resolves the style, follows any parent
 * link and loads every locale that could be asked for, and a synchronous
 * *render* phase once all of it is in memory.
 *
 * citeproc is loaded with a dynamic import so its ~700 KB stays out of the
 * initial bundle: nothing is formatted until there is something to format.
 */

type CSLModule = { Engine: typeof Engine };

let cslModule: Promise<CSLModule> | null = null;

async function loadCiteproc(): Promise<CSLModule> {
  cslModule ??= import('citeproc').then((mod) => {
    // The package is CommonJS, so bundlers may hand back either the exports
    // object itself or an ES-module namespace wrapping it.
    const candidate = (mod as unknown as { default?: CSLModule }).default ?? mod;
    return candidate as CSLModule;
  });
  return cslModule;
}

export interface EngineHandle {
  engine: Engine;
  styleId: string;
  effectiveStyleId: string;
  styleTitle: string;
  localeId: string;
  /** Whether the style defines a bibliography at all (some note styles do not). */
  hasBibliography: boolean;
}

/** Items the engine can see, swapped per render. */
type ItemLookup = Map<string, CSLItem>;

interface CachedEngine extends EngineHandle {
  items: ItemLookup;
}

/**
 * Building an engine parses ~85 KB of XML, so engines are cached per
 * style+locale and re-pointed at fresh items on each render rather than
 * rebuilt. The cache is small on purpose — a user cycles through a handful of
 * styles, and each retained engine holds its parsed style in memory.
 */
const engines = new Map<string, CachedEngine>();
const MAX_CACHED_ENGINES = 4;

function cacheKey(styleId: string, localeId: string): string {
  return `${styleId}::${localeId}`;
}

export async function getEngine(styleId: string, localeId: string): Promise<CachedEngine> {
  const key = cacheKey(styleId, localeId);
  const cached = engines.get(key);
  if (cached) return cached;

  const [CSL, style] = await Promise.all([loadCiteproc(), resolveStyle(styleId)]);
  const locales = await preloadLocales([localeId, style.info.defaultLocale]);

  const items: ItemLookup = new Map();

  const sys: CiteprocSys = {
    retrieveItem: (id) => {
      const item = items.get(id);
      if (item) return item;
      // citeproc will happily render a ghost entry from an empty item; a
      // visible marker is easier to diagnose than a blank line.
      return { id, type: 'document', title: `[missing reference: ${id}]` };
    },
    retrieveLocale: (lang) => {
      return (
        locales.get(lang) ??
        locales.get(lang.split('-')[0] ?? lang) ??
        locales.get(FALLBACK_LOCALE) ??
        ''
      );
    },
  };

  const engine = new CSL.Engine(sys, style.xml, localeId);
  engine.setOutputFormat('html');

  const handle: CachedEngine = {
    engine,
    items,
    styleId: style.requestedId,
    effectiveStyleId: style.effectiveId,
    styleTitle: style.title,
    localeId,
    hasBibliography: engine.opt.has_bibliography !== false,
  };

  if (engines.size >= MAX_CACHED_ENGINES) {
    const oldest = engines.keys().next().value;
    if (oldest) engines.delete(oldest);
  }
  engines.set(key, handle);
  return handle;
}

/**
 * How the bibliography should be laid out, lifted out of citeproc's metadata.
 *
 * This has to come from the style, not from CSS: APA wants a hanging indent,
 * IEEE wants a flush-left `[1]` gutter, and hard-coding either one mis-renders
 * the other. `maxoffset` is the width of the widest label, which is what sizes
 * that gutter.
 */
export interface BibliographyLayout {
  hangingIndent: boolean;
  secondFieldAlign: false | 'flush' | 'margin';
  maxOffset: number;
  entrySpacing: number;
  lineSpacing: number;
}

export interface BibliographyResult {
  /** One HTML string per entry, in the order the style demands. */
  entries: string[];
  /** Entry ids, parallel to `entries`. */
  ids: string[];
  layout: BibliographyLayout;
  /** Ids citeproc could not render; surfaced rather than silently dropped. */
  errors: string[];
  styleTitle: string;
}

const EMPTY_LAYOUT: BibliographyLayout = {
  hangingIndent: false,
  secondFieldAlign: false,
  maxOffset: 0,
  entrySpacing: 0,
  lineSpacing: 1,
};

function toLayout(meta: BibliographyMeta): BibliographyLayout {
  return {
    hangingIndent: Boolean(meta.hangingindent),
    secondFieldAlign: meta['second-field-align'] ?? false,
    maxOffset: meta.maxoffset ?? 0,
    entrySpacing: meta.entryspacing ?? 0,
    lineSpacing: meta.linespacing ?? 1,
  };
}

/**
 * Renders a full bibliography.
 *
 * The order is the style's, not the table's: APA sorts alphabetically, IEEE by
 * order of citation. That is why the rendered list is not simply the rows in
 * the order the user sees them.
 */
export async function renderBibliography(
  items: CSLItem[],
  styleId: string,
  localeId: string,
): Promise<BibliographyResult> {
  const handle = await getEngine(styleId, localeId);

  handle.items.clear();
  for (const item of items) handle.items.set(item.id, item);

  if (items.length === 0) {
    return { entries: [], ids: [], layout: EMPTY_LAYOUT, errors: [], styleTitle: handle.styleTitle };
  }

  handle.engine.updateItems(items.map((i) => i.id));
  const result = handle.engine.makeBibliography();

  if (!result) {
    // Note-only styles define no bibliography; that is a valid style, not a bug.
    return { entries: [], ids: [], layout: EMPTY_LAYOUT, errors: [], styleTitle: handle.styleTitle };
  }

  const [meta, entries] = result;
  return {
    entries: entries.map((entry) => entry.trim()),
    ids: meta.entry_ids.map((group) => group[0] ?? ''),
    layout: toLayout(meta),
    errors: meta.bibliography_errors ?? [],
    styleTitle: handle.styleTitle,
  };
}

/**
 * Renders the in-text citation for one reference — `(Vaswani, 2017)`, `[1]`,
 * or a footnote, depending on the style. Used for the copy-citation action and
 * the row preview.
 */
export async function renderCitation(
  item: CSLItem,
  styleId: string,
  localeId: string,
  options: Omit<CitationItem, 'id'> = {},
): Promise<string> {
  const handle = await getEngine(styleId, localeId);

  handle.items.clear();
  handle.items.set(item.id, item);
  handle.engine.updateItems([item.id]);

  return handle.engine.makeCitationCluster([{ id: item.id, ...options }]).trim();
}

/**
 * In-text citations for a whole list, rendered together.
 *
 * Rendering one reference at a time is wrong for numeric styles: citeproc
 * assigns `citation-number` from the items currently registered, so every
 * reference rendered alone comes out as "[1]". Registering the full set first
 * gives each its real number, and author-date styles get their disambiguation
 * (2013a / 2013b) for the same reason.
 */
export async function renderCitations(
  items: CSLItem[],
  styleId: string,
  localeId: string,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (items.length === 0) return labels;

  const handle = await getEngine(styleId, localeId);

  handle.items.clear();
  for (const item of items) handle.items.set(item.id, item);
  handle.engine.updateItems(items.map((i) => i.id));

  for (const item of items) {
    labels.set(item.id, handle.engine.makeCitationCluster([{ id: item.id }]).trim());
  }

  return labels;
}

/** Discards cached engines — call after a style's XML is refreshed. */
export function clearEngineCache(): void {
  engines.clear();
}

/** Strips tags for plain-text copy and for `.txt`/BibTeX-adjacent output. */
export function toPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#38;|&amp;/g, '&')
    .replace(/&#60;|&lt;/g, '<')
    .replace(/&#62;|&gt;/g, '>')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
