/**
 * Where CSL assets come from.
 *
 * Two origins, tried in order. A self-hosted copy under `/csl/` wins when it
 * exists (run `npm run fetch:styles` to vendor the styles you ship), otherwise
 * the official repositories via jsDelivr. Self-hosting first means a
 * deployment can be made fully independent of a CDN without touching code.
 */

const STYLES_CDN =
  import.meta.env.VITE_CSL_STYLES_CDN ||
  'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master';

const LOCALES_CDN =
  import.meta.env.VITE_CSL_LOCALES_CDN ||
  'https://cdn.jsdelivr.net/gh/citation-style-language/locales@master';

/**
 * Style ids are filenames in the CSL repository. Independent styles sit at the
 * root; the ~1,700 dependent styles (a journal that just says "use Nature's
 * rules") live under `dependent/`. We cannot tell which from the id alone, so
 * both paths are candidates and the first that responds wins.
 */
export function styleUrls(styleId: string): string[] {
  const safe = encodeURIComponent(styleId);
  return [
    `/csl/styles/${safe}.csl`,
    `${STYLES_CDN}/${safe}.csl`,
    `${STYLES_CDN}/dependent/${safe}.csl`,
  ];
}

export function localeUrls(localeId: string): string[] {
  const safe = encodeURIComponent(localeId);
  return [`/csl/locales/locales-${safe}.xml`, `${LOCALES_CDN}/locales-${safe}.xml`];
}

/** A style id out of an `independent-parent` href, e.g. `.../styles/nature`. */
export function styleIdFromHref(href: string): string {
  return href.replace(/\/+$/, '').split('/').pop() ?? href;
}

/** The namespace every CSL style and locale document declares. */
const CSL_NAMESPACE = 'purl.org/net/xbiblio/csl';

export type CSLDocumentKind = 'style' | 'locale';

/**
 * Confirms a response really is the CSL document we asked for.
 *
 * A status check is not enough. Single-page hosting serves `index.html` with
 * HTTP 200 for any unmatched path, so a request for a style that is not
 * self-hosted comes back as the app's own HTML — which then reaches citeproc
 * as a "style" and fails deep inside the parser with an error that says
 * nothing about the real cause. The same applies to captive portals and CDN
 * error pages. So the body has to identify itself.
 */
export function isCSLDocument(text: string, kind: CSLDocumentKind): boolean {
  const head = text.slice(0, 2000);
  if (!head.includes(CSL_NAMESPACE)) return false;
  return kind === 'style' ? /<style[\s>]/.test(head) : /<locale[\s>]/.test(head);
}

export class CSLFetchError extends Error {
  constructor(
    readonly resource: string,
    readonly attempts: string[],
  ) {
    super(`Could not load ${resource}. Tried: ${attempts.join(', ')}`);
    this.name = 'CSLFetchError';
  }
}

/**
 * Tries each candidate URL until one returns a genuine CSL document. A miss on
 * the first candidate is the normal case — most styles are not self-hosted,
 * and two-thirds are dependent — so only failing every candidate is an error.
 */
export async function fetchFirst(
  resource: string,
  urls: string[],
  kind: CSLDocumentKind,
): Promise<string> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const text = await response.text();
      if (isCSLDocument(text, kind)) return text;
    } catch {
      // Network error on one candidate: fall through to the next.
    }
  }
  throw new CSLFetchError(resource, urls);
}
