import type { CSLItem, LookupResult } from '@opencite/shared';
import { fetchJSON } from '../http';
import { compactCSL, parseDate, parseName } from '../csl';

/**
 * Google Books — the ISBN fallback.
 *
 * Second rather than first because unauthenticated requests share a daily
 * quota per calling address and begin failing with HTTP 429 once it is spent,
 * which is not a foundation for a "free and unlimited" promise. Set
 * `GOOGLE_BOOKS_API_KEY` to get a quota of your own; without it this is a
 * best-effort backstop for ISBNs Open Library has never heard of.
 */

const API = 'https://www.googleapis.com/books/v1/volumes';

interface VolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  language?: string;
  infoLink?: string;
  categories?: string[];
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
}

export function googleBooksToCSL(info: VolumeInfo, isbn: string, id: string): CSLItem {
  const title = [info.title, info.subtitle].filter(Boolean).join(': ');
  const isbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;

  return compactCSL({
    id,
    type: 'book',
    title,
    author: (info.authors ?? []).map(parseName),
    publisher: info.publisher,
    issued: parseDate(info.publishedDate),
    'number-of-pages': info.pageCount ? String(info.pageCount) : undefined,
    language: info.language,
    ISBN: isbn13 ?? isbn,
    URL: info.infoLink,
  });
}

export async function resolveGoogleBooksISBN(isbn: string): Promise<LookupResult | undefined> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url =
    `${API}?q=isbn:${encodeURIComponent(isbn)}` + (key ? `&key=${encodeURIComponent(key)}` : '');

  const response = await fetchJSON<{ items?: Array<{ volumeInfo?: VolumeInfo }> }>(url);
  const info = response?.items?.[0]?.volumeInfo;
  if (!info?.title) return undefined;

  return {
    csl: googleBooksToCSL(info, isbn, `isbn:${isbn}`),
    resolver: 'google-books',
    key: `isbn:${isbn}`,
    confidence: 0.85,
  };
}
