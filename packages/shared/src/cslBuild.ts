import type { CSLDate, CSLDatePart, CSLItem, CSLName } from './csl';

/**
 * Turning upstream metadata into CSL-JSON.
 *
 * Every resolver ends here, because the awkward parts — splitting a name that
 * arrived as one string, reading a date that could be "1998", "March 1998" or
 * an ISO timestamp — are the same everywhere and are where wrong citations
 * come from.
 */

/**
 * Words that mean the "author" is an organisation. CSL has a separate shape
 * for these (`literal`), and getting it wrong turns "World Health
 * Organization" into a person named O. World.
 */
const ORGANISATION_HINTS =
  /\b(universit|institut|college|school|academy|press|publish|department|ministry|bureau|committee|council|agency|association|organi[sz]ation|society|commission|corporation|company|foundation|laborator|centre|center|office|board|trust|museum|library|hospital|group|team|network|project|inc|llc|ltd|gmbh|bv|plc|nhs|who|nasa|oecd|unesco|unicef)\b/i;

export function looksLikeOrganisation(name: string): boolean {
  return ORGANISATION_HINTS.test(name);
}

const SUFFIXES = /^(jr|sr|ii|iii|iv|phd|md|esq)\.?$/i;

/**
 * Parses a name that arrived as a single string.
 *
 * Handles "Family, Given" and "Given Family". Anything that reads as an
 * organisation is kept whole as a `literal`, which is what CSL expects and
 * what stops styles from initialising it into nonsense.
 */
export function parseName(raw: string): CSLName {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { literal: '' };

  if (looksLikeOrganisation(name)) return { literal: name };

  // "Arendt, Hannah" — the explicit form, so trust it.
  const comma = name.split(',');
  if (comma.length === 2 && comma[0]!.trim() && comma[1]!.trim()) {
    return { family: comma[0]!.trim(), given: comma[1]!.trim() };
  }

  const parts = name.split(' ');
  if (parts.length === 1) return { family: parts[0]!, given: '' };

  // Trailing "Jr." belongs in its own field, not glued to the family name.
  let suffix: string | undefined;
  if (parts.length > 2 && SUFFIXES.test(parts[parts.length - 1]!)) {
    suffix = parts.pop();
  }

  const family = parts.pop()!;
  return {
    family,
    given: parts.join(' '),
    ...(suffix ? { suffix } : {}),
  };
}

export function parseNames(raw: string | string[] | undefined): CSLName[] {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : // Author meta tags use ";" for multiple people, and " and " in BibTeX-ish sources.
      raw.split(/;|\band\b(?![^(]*\))/i);
  return list.map((n) => n.trim()).filter(Boolean).map(parseName);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Reads a date from whatever shape it arrived in.
 *
 * Precision is preserved rather than invented: "1998" becomes `[1998]`, not
 * `[1998, 1, 1]`. Styles print "n.d." or a bare year depending on what they
 * are given, so inventing a January would put a wrong date in a citation.
 */
export function parseDate(raw: string | number | undefined | null): CSLDate | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const text = String(raw).trim();

  // ISO 8601, with or without a time component.
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(text);
  if (iso) {
    const parts = [Number(iso[1]), Number(iso[2])];
    if (iso[3]) parts.push(Number(iso[3]));
    return { 'date-parts': [parts as unknown as CSLDatePart] };
  }

  // Bare year.
  const year = /^(\d{4})$/.exec(text);
  if (year) return { 'date-parts': [[Number(year[1])]] };

  // "March 1998", "12 March 1998", "March 12, 1998".
  const named = /(\d{1,2})?\s*([a-z]{3,})\.?,?\s*(\d{1,2})?,?\s*(\d{4})/i.exec(text);
  if (named) {
    const month = MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    const day = named[1] ?? named[3];
    if (month) {
      const parts: number[] = [Number(named[4]), month];
      if (day) parts.push(Number(day));
      return { 'date-parts': [parts as unknown as CSLDatePart] };
    }
  }

  // A year buried in a longer string is better than nothing.
  const loose = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(text);
  if (loose) return { 'date-parts': [[Number(loose[1])]] };

  // Unparseable: keep it verbatim so the style can print it as-is.
  return { literal: text };
}

/** Today, for the `accessed` field on scraped pages. */
export function accessedToday(): CSLDate {
  const now = new Date();
  return {
    'date-parts': [[now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()]],
  };
}

/** Crossref abstracts arrive as JATS XML; styles want plain text. */
export function stripMarkup(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

/** Drops empty values so a CSL item never carries `""` or `[]`. */
export function compactCSL(item: Record<string, unknown>): CSLItem {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as CSLItem;
}
