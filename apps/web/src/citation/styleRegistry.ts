import type { StyleCacheEntry } from '@opencite/shared';
import { db } from '@/db/dexieStore';
import { CSLFetchError, fetchFirst, localeUrls, styleIdFromHref, styleUrls } from './cslSource';

/**
 * Fetches CSL styles and locales, and remembers them.
 *
 * Two cache tiers. The `styles` table in IndexedDB survives reloads and makes
 * the app work offline once a style has been seen; a module-level Map in front
 * of it avoids a round trip on every render. Nothing here is user data, so the
 * table is deliberately left alone by "delete all my data".
 *
 * Entries are served immediately however old they are, and refreshed in the
 * background past `STALE_AFTER_MS` — a style that formats slightly out-of-date
 * is far better than a spinner, and CSL styles change rarely.
 */

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Locale every engine needs: citeproc falls back to it internally. */
export const FALLBACK_LOCALE = 'en-US';

const memory = new Map<string, StyleCacheEntry>();
/** De-duplicates concurrent requests for the same asset. */
const inFlight = new Map<string, Promise<StyleCacheEntry>>();

export interface StyleInfo {
  id: string;
  title: string;
  /** Set when this is a dependent style pointing at another style's rules. */
  parentId?: string;
  /** The style's own `default-locale`, if it pins one. */
  defaultLocale?: string;
  categoryFormat?: string;
}

/**
 * Pulls the `<info>` block out of a style without a full XML parse.
 *
 * Regex over XML is usually a mistake, but here the shape is fixed by the CSL
 * schema, the alternative is instantiating a DOMParser for every cached style,
 * and citeproc re-parses the document properly anyway. We only need enough to
 * decide whether to follow a parent link and what to show in the picker.
 */
export function parseStyleInfo(xml: string, fallbackId: string): StyleInfo {
  const head = xml.slice(0, 8000);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(head)?.[1]?.trim();
  const parentHref = /<link[^>]+rel="independent-parent"[^>]*>/.exec(head)?.[0];
  const href = parentHref ? /href="([^"]+)"/.exec(parentHref)?.[1] : undefined;
  const defaultLocale = /<style[^>]+default-locale="([^"]+)"/.exec(head)?.[1];
  const categoryFormat = /<category[^>]+citation-format="([^"]+)"/.exec(head)?.[1];

  return {
    id: fallbackId,
    title: title ? decodeEntities(title) : fallbackId,
    ...(href ? { parentId: styleIdFromHref(href) } : {}),
    ...(defaultLocale ? { defaultLocale } : {}),
    ...(categoryFormat ? { categoryFormat } : {}),
  };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function readCache(key: string): Promise<StyleCacheEntry | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  const stored = await db.styles.get(key);
  if (stored) memory.set(key, stored);
  return stored;
}

async function writeCache(entry: StyleCacheEntry): Promise<void> {
  memory.set(entry.id, entry);
  await db.styles.put(entry);
}

function isStale(entry: StyleCacheEntry): boolean {
  return Date.now() - entry.fetchedAt > STALE_AFTER_MS;
}

async function fetchStyleEntry(styleId: string): Promise<StyleCacheEntry> {
  const xml = await fetchFirst(`style "${styleId}"`, styleUrls(styleId), 'style');
  const info = parseStyleInfo(xml, styleId);
  const entry: StyleCacheEntry = {
    id: styleId,
    kind: 'style',
    title: info.title,
    xml,
    ...(info.parentId ? { parentId: info.parentId } : {}),
    fetchedAt: Date.now(),
  };
  await writeCache(entry);
  return entry;
}

async function fetchLocaleEntry(localeId: string): Promise<StyleCacheEntry> {
  const key = localeKey(localeId);
  const xml = await fetchFirst(`locale "${localeId}"`, localeUrls(localeId), 'locale');
  const entry: StyleCacheEntry = {
    id: key,
    kind: 'locale',
    title: localeId,
    xml,
    fetchedAt: Date.now(),
  };
  await writeCache(entry);
  return entry;
}

/** Locales share the `styles` table, so their keys are namespaced. */
export function localeKey(localeId: string): string {
  return `locale:${localeId}`;
}

/** Cache-first load with background revalidation. */
async function load(
  key: string,
  fetcher: () => Promise<StyleCacheEntry>,
): Promise<StyleCacheEntry> {
  const cached = await readCache(key);
  if (cached) {
    if (isStale(cached)) {
      // Refresh for next time; the caller gets the cached copy now.
      void fetcher().catch(() => undefined);
    }
    return cached;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetcher().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Max hops when following `independent-parent`, to stop a cyclic chain. */
const MAX_PARENT_DEPTH = 5;

export interface ResolvedStyle {
  /** The id that was asked for — what the project stores and the UI shows. */
  requestedId: string;
  /** The id whose XML is actually used; differs for a dependent style. */
  effectiveId: string;
  title: string;
  xml: string;
  info: StyleInfo;
}

/**
 * Resolves a style id to the XML citeproc should run.
 *
 * Roughly two-thirds of the CSL repository is dependent styles: files whose
 * only content is a pointer at another style's rules. Handing one of those to
 * citeproc produces a style with no formatting at all, so the parent link is
 * followed here — keeping the requested id for display, because the user
 * chose "Nature Neuroscience" and should keep seeing that.
 */
export async function resolveStyle(styleId: string): Promise<ResolvedStyle> {
  const requested = await load(styleId, () => fetchStyleEntry(styleId));
  let current = requested;
  let info = parseStyleInfo(current.xml, current.id);
  const seen = new Set([styleId]);

  for (let depth = 0; info.parentId && depth < MAX_PARENT_DEPTH; depth += 1) {
    const parentId: string = info.parentId;
    if (seen.has(parentId)) break; // Cyclic link in the repository; use what we have.
    seen.add(parentId);
    current = await load(parentId, () => fetchStyleEntry(parentId));
    info = parseStyleInfo(current.xml, current.id);
  }

  return {
    requestedId: styleId,
    effectiveId: current.id,
    // A dependent style's own title is the one worth showing.
    title: requested.title,
    xml: current.xml,
    info,
  };
}

export async function resolveLocale(localeId: string): Promise<string> {
  const entry = await load(localeKey(localeId), () => fetchLocaleEntry(localeId));
  return entry.xml;
}

/**
 * Loads every locale an engine could ask for before it is constructed.
 *
 * `retrieveLocale` cannot await, so a locale that is not already in memory when
 * citeproc asks for it is simply unavailable. Preloading the requested locale,
 * the style's own default and `en-US` covers every case we can predict; the
 * engine's `sys` falls back to `en-US` for anything we could not.
 */
export async function preloadLocales(localeIds: Array<string | undefined>): Promise<Map<string, string>> {
  const wanted = [...new Set([FALLBACK_LOCALE, ...localeIds.filter(Boolean)])] as string[];
  const loaded = new Map<string, string>();

  await Promise.all(
    wanted.map(async (id) => {
      try {
        loaded.set(id, await resolveLocale(id));
      } catch (error) {
        // A missing regional locale is survivable; a missing en-US is not.
        if (id === FALLBACK_LOCALE) throw error;
      }
    }),
  );

  return loaded;
}

/** Drops the in-memory tier. The IndexedDB tier is left intact. */
export function clearStyleMemoryCache(): void {
  memory.clear();
  inFlight.clear();
}

export { CSLFetchError };
