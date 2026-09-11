import type { StyleIndexEntry } from '@opencite/shared';

/**
 * The styles offered in the picker by default.
 *
 * The CSL repository holds roughly 2,600 styles, which is far too many to put
 * in a dropdown and far too much to download for a first paint. This is the
 * shortlist that covers most academic writing; anything else is reachable by
 * typing its CSL id, and Step 4's picker will search the full index.
 *
 * Every id here was checked against the repository — ids drift between
 * editions (there is no `vancouver` in current master, and the Turabian styles
 * exist only as dependent files), so they are verified rather than assumed.
 */
export const STYLE_CATALOG: StyleIndexEntry[] = [
  { id: 'apa', title: 'American Psychological Association 7th edition', shortTitle: 'APA 7', category: 'author-date', popular: true },
  { id: 'modern-language-association', title: 'Modern Language Association 9th edition', shortTitle: 'MLA 9', category: 'in-text', popular: true },
  { id: 'harvard-cite-them-right', title: 'Cite Them Right 12th edition — Harvard', shortTitle: 'Harvard', category: 'author-date', popular: true },
  { id: 'chicago-notes-bibliography', title: 'Chicago Manual of Style 18th edition (notes and bibliography)', shortTitle: 'Chicago (notes)', category: 'note', popular: true },
  { id: 'chicago-author-date', title: 'Chicago Manual of Style 18th edition (author-date)', shortTitle: 'Chicago (author-date)', category: 'author-date', popular: true },
  { id: 'ieee', title: 'IEEE', shortTitle: 'IEEE', category: 'numeric', popular: true },
  { id: 'american-medical-association', title: 'American Medical Association 11th edition', shortTitle: 'AMA 11', category: 'numeric', popular: true },
  { id: 'american-chemical-society', title: 'American Chemical Society', shortTitle: 'ACS', category: 'numeric' },
  { id: 'american-sociological-association', title: 'American Sociological Association 7th edition', shortTitle: 'ASA', category: 'author-date' },
  { id: 'american-political-science-association', title: 'American Political Science Association', shortTitle: 'APSA', category: 'author-date' },
  { id: 'american-institute-of-physics', title: 'American Institute of Physics 4th edition', shortTitle: 'AIP', category: 'numeric' },
  { id: 'turabian-notes-bibliography', title: 'Turabian 9th edition (notes and bibliography)', shortTitle: 'Turabian (notes)', category: 'note' },
  { id: 'turabian-author-date', title: 'Turabian 9th edition (author-date)', shortTitle: 'Turabian (author-date)', category: 'author-date' },
  { id: 'nature', title: 'Nature', shortTitle: 'Nature', category: 'numeric' },
  { id: 'science', title: 'Science', shortTitle: 'Science', category: 'numeric' },
  { id: 'cell', title: 'Cell', shortTitle: 'Cell', category: 'author-date' },
  { id: 'the-lancet', title: 'The Lancet', shortTitle: 'Lancet', category: 'numeric' },
  { id: 'bmj', title: 'BMJ', shortTitle: 'BMJ', category: 'numeric' },
  { id: 'elsevier-harvard', title: 'Elsevier — Harvard', shortTitle: 'Elsevier Harvard', category: 'author-date' },
  { id: 'springer-basic-author-date', title: 'Springer — basic (author-date)', shortTitle: 'Springer', category: 'author-date' },
  { id: 'acm-sig-proceedings', title: 'ACM SIG Proceedings', shortTitle: 'ACM', category: 'numeric' },
  { id: 'apa-6th-edition', title: 'American Psychological Association 6th edition', shortTitle: 'APA 6', category: 'author-date' },
];

/** Locales with a complete CSL translation that users actually ask for. */
export const LOCALE_CATALOG = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'de-DE', label: 'German' },
  { id: 'fr-FR', label: 'French' },
  { id: 'es-ES', label: 'Spanish' },
  { id: 'it-IT', label: 'Italian' },
  { id: 'nl-NL', label: 'Dutch' },
  { id: 'pt-BR', label: 'Portuguese (Brazil)' },
  { id: 'pl-PL', label: 'Polish' },
  { id: 'zh-CN', label: 'Chinese (Simplified)' },
  { id: 'ja-JP', label: 'Japanese' },
] as const;

export function findStyle(id: string): StyleIndexEntry | undefined {
  return STYLE_CATALOG.find((s) => s.id === id);
}

/** Substring match over id and title, popular styles first. */
export function searchCatalog(query: string): StyleIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return STYLE_CATALOG.filter((s) => s.popular);
  return STYLE_CATALOG.filter(
    (s) =>
      s.id.includes(q) ||
      s.title.toLowerCase().includes(q) ||
      (s.shortTitle?.toLowerCase().includes(q) ?? false),
  );
}
