/**
 * Works out what the user pasted.
 *
 * The Autocite bar takes one box of text, so the server has to decide whether
 * it is looking at a DOI, an ISBN, an arXiv id or a plain URL. Order matters:
 * a doi.org link is a DOI, not a web page, and an arxiv.org link is an arXiv
 * id — resolving either as a web page would scrape a landing page when
 * authoritative metadata was one request away.
 */

export type IdentifierKind = 'doi' | 'isbn' | 'arxiv' | 'pmid' | 'url' | 'unknown';

export interface Identifier {
  kind: IdentifierKind;
  /** Canonical form: a bare DOI, a digits-only ISBN, a normalised URL. */
  value: string;
  /** Cache key shared with the client's `metadataCache` table. */
  key: string;
  /** What the user actually typed, kept for provenance. */
  input: string;
}

/** `10.` then a registrant code, then anything that is not whitespace. */
const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;

/** New-style `2103.00020` (optionally versioned) and old-style `math.GT/0309136`. */
const ARXIV_NEW = /\b(\d{4}\.\d{4,5})(v\d+)?\b/;
const ARXIV_OLD = /\b([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?\b/;

const PMID_PATTERN = /\bpmid:?\s*(\d{4,9})\b/i;

/**
 * ISBN-10 and ISBN-13 checksums.
 *
 * Worth validating rather than pattern-matching: plenty of thirteen-digit
 * numbers are not ISBNs, and silently looking one up returns a confident
 * wrong book instead of an honest "not found".
 */
export function isValidISBN(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, '').toUpperCase();

  if (/^\d{9}[\dX]$/.test(digits)) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const char = digits[i]!;
      const value = char === 'X' ? 10 : Number(char);
      sum += value * (10 - i);
    }
    return sum % 11 === 0;
  }

  if (/^\d{13}$/.test(digits)) {
    let sum = 0;
    for (let i = 0; i < 13; i += 1) {
      sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return sum % 10 === 0;
  }

  return false;
}

export function normalizeISBN(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** DOIs are case-insensitive, so the cache key is lowercased. */
export function normalizeDOI(raw: string): string {
  return raw
    .trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/[.,;)]+$/, '');
}

/** Drops tracking parameters and fragments so the same page caches once. */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_[ce]id$|igshid$|ref$|ref_src$|s_cid$)/i;

export function normalizeURL(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    for (const name of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(name)) url.searchParams.delete(name);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return raw.trim();
  }
}

const LOOKS_LIKE_URL = /^(https?:\/\/\S+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)$/i;

export function identify(input: string): Identifier {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'unknown', value: '', key: '', input };

  // A DOI anywhere in the string wins — including inside a doi.org URL.
  const doi = DOI_PATTERN.exec(trimmed);
  if (doi?.[1]) {
    const value = normalizeDOI(doi[1]);
    return { kind: 'doi', value, key: `doi:${value.toLowerCase()}`, input };
  }

  // arXiv, either as a bare id, an `arXiv:` prefix, or an arxiv.org link.
  const isArxivContext = /arxiv/i.test(trimmed);
  if (isArxivContext) {
    const match = ARXIV_NEW.exec(trimmed) ?? ARXIV_OLD.exec(trimmed);
    if (match?.[1]) {
      return { kind: 'arxiv', value: match[1], key: `arxiv:${match[1]}`, input };
    }
  }

  const pmid = PMID_PATTERN.exec(trimmed);
  if (pmid?.[1]) {
    return { kind: 'pmid', value: pmid[1], key: `pmid:${pmid[1]}`, input };
  }

  // ISBN only when the checksum agrees, so a random number is not "a book".
  const isbnCandidate = trimmed.replace(/^isbn[:\s-]*/i, '');
  if (isValidISBN(isbnCandidate)) {
    const value = normalizeISBN(isbnCandidate);
    return { kind: 'isbn', value, key: `isbn:${value}`, input };
  }

  if (LOOKS_LIKE_URL.test(trimmed)) {
    const value = normalizeURL(trimmed);
    return { kind: 'url', value, key: `url:${value}`, input };
  }

  return { kind: 'unknown', value: trimmed, key: '', input };
}

/**
 * arXiv mints a DOI for every paper, so an arXiv id can be resolved through
 * the same registries as any other DOI instead of needing its own parser.
 */
export function arxivToDOI(arxivId: string): string {
  return `10.48550/arXiv.${arxivId}`;
}
