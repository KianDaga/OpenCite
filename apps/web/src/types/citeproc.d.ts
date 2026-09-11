/**
 * citeproc-js ships no type declarations, so this is the contract we hold it
 * to. Only the surface OpenCite uses is declared.
 */
declare module 'citeproc' {
  type CSLItem = import('@opencite/shared').CSLItem;

  /**
   * The host interface citeproc calls back into.
   *
   * Both methods are **synchronous** — citeproc calls them mid-render and
   * cannot await. That single constraint dictates the whole design of
   * `citation/engine.ts`: styles, locales and items are all resolved up front,
   * and the engine is constructed only once everything is in memory.
   */
  export interface CiteprocSys {
    retrieveItem(id: string): CSLItem;
    retrieveLocale(lang: string): string;
    /** Optional hook for wrapping rendered variables (links, DOIs). */
    variableWrapper?: (
      params: { variableNames: string[]; context: string; itemData: CSLItem },
      prePunct: string,
      str: string,
      postPunct: string,
    ) => string;
  }

  /** Second element of `makeBibliography()`'s return value is the entry HTML. */
  export interface BibliographyMeta {
    /** Width of the widest label, in characters — sizes the numeric gutter. */
    maxoffset: number;
    entryspacing: number;
    linespacing: number;
    /** `false`, or how a numeric style aligns its label column. */
    'second-field-align': false | 'flush' | 'margin';
    entry_ids: string[][];
    bibliography_errors: string[];
    done: boolean;
    bibstart: string;
    bibend: string;
    /** Present (and true) only for styles that call for a hanging indent. */
    hangingindent?: boolean | number;
  }

  export interface CitationItem {
    id: string;
    locator?: string;
    label?: string;
    prefix?: string;
    suffix?: string;
    'suppress-author'?: boolean;
    'author-only'?: boolean;
  }

  export class Engine {
    constructor(sys: CiteprocSys, style: string, lang?: string, forceLang?: boolean);
    updateItems(ids: string[], nosort?: boolean): void;
    updateUncitedItems(ids: string[]): void;
    /** `[meta, entries]`, or `false` when the style defines no bibliography. */
    makeBibliography(): [BibliographyMeta, string[]] | false;
    makeCitationCluster(items: CitationItem[]): string;
    previewCitationCluster(
      citation: { citationItems: CitationItem[]; properties?: Record<string, unknown> },
      pre: Array<[string, number]>,
      post: Array<[string, number]>,
      format: string,
    ): string;
    setOutputFormat(format: 'html' | 'text' | 'rtf'): void;
    opt: { has_bibliography: boolean; xclass: string; [key: string]: unknown };
  }

  export const PROCESSOR_VERSION: string;

  const CSL: { Engine: typeof Engine; PROCESSOR_VERSION: string };
  export default CSL;
}
