import type { CSLItem, LookupResult } from '@opencite/shared';
import { fetchJSON } from '../http';
import { compactCSL, parseDate, parseName } from '../csl';

/**
 * Open Library — the primary ISBN resolver.
 *
 * Primary rather than Google Books because it needs no API key and applies no
 * per-project quota: an unauthenticated Google Books request shares a quota
 * with everyone else on the same address and starts returning 429 without
 * warning. Open Library is also open data, which suits the project.
 *
 * Its weakness is unparsed author names ("Hannah Arendt" as one string) and
 * loose dates ("1998", "March 1998"), both handled in `csl.ts`.
 */

const API = 'https://openlibrary.org/api/books';

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_places?: Array<{ name?: string }>;
  publish_date?: string;
  number_of_pages?: number;
  pagination?: string;
  url?: string;
  identifiers?: { isbn_10?: string[]; isbn_13?: string[] };
  by_statement?: string;
}

export function openLibraryToCSL(book: OpenLibraryBook, isbn: string, id: string): CSLItem {
  const title = [book.title, book.subtitle].filter(Boolean).join(': ');

  return compactCSL({
    id,
    type: 'book',
    title,
    author: (book.authors ?? [])
      .map((a) => a.name)
      .filter((n): n is string => Boolean(n))
      .map(parseName),
    publisher: book.publishers?.[0]?.name,
    'publisher-place': book.publish_places?.[0]?.name,
    issued: parseDate(book.publish_date),
    'number-of-pages': book.number_of_pages ? String(book.number_of_pages) : undefined,
    ISBN: isbn,
    URL: book.url,
  });
}

export async function resolveOpenLibraryISBN(isbn: string): Promise<LookupResult | undefined> {
  const url = `${API}?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
  const response = await fetchJSON<Record<string, OpenLibraryBook>>(url);

  const book = response?.[`ISBN:${isbn}`];
  if (!book?.title) return undefined;

  return {
    csl: openLibraryToCSL(book, isbn, `isbn:${isbn}`),
    resolver: 'openlibrary',
    key: `isbn:${isbn}`,
    // Confident about the book; author names had to be split by heuristic.
    confidence: 0.9,
  };
}
