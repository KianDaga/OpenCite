import type { CSLItemType } from '@opencite/shared';

/**
 * Which fields the manual-entry form shows, per reference type.
 *
 * CSL defines roughly eighty variables. Showing all of them for every type
 * would make hand-entering a book a search task, and most are meaningless for
 * most types — a book has no issue number, a web page has no publisher place.
 * So each type gets the fields its styles actually read, and everything else
 * stays available under "More fields".
 */

export type FieldKind = 'text' | 'names' | 'date' | 'textarea' | 'number';

export interface FieldSpec {
  /** CSL variable name. */
  name: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  /** Rendered full width rather than in the two-column grid. */
  wide?: boolean;
}

const F = (name: string, label: string, kind: FieldKind = 'text', extra: Partial<FieldSpec> = {}): FieldSpec => ({
  name,
  label,
  kind,
  ...extra,
});

const TITLE = F('title', 'Title', 'text', { wide: true });
const AUTHOR = F('author', 'Authors', 'names', { wide: true });
const ISSUED = F('issued', 'Date published', 'date');
const ACCESSED = F('accessed', 'Date accessed', 'date');
const URL_FIELD = F('URL', 'URL', 'text', { wide: true, placeholder: 'https://' });
const DOI = F('DOI', 'DOI', 'text', { placeholder: '10.1038/…' });
const PAGE = F('page', 'Pages', 'text', { placeholder: '54-58' });
const PUBLISHER = F('publisher', 'Publisher');
const PLACE = F('publisher-place', 'Place of publication');
const EDITION = F('edition', 'Edition');
const EDITOR = F('editor', 'Editors', 'names', { wide: true });
const ABSTRACT = F('abstract', 'Abstract', 'textarea', { wide: true });
const LANGUAGE = F('language', 'Language', 'text', { placeholder: 'en' });

/** Shown for every type, after the type-specific fields. */
export const COMMON_EXTRA_FIELDS: FieldSpec[] = [LANGUAGE, ABSTRACT, F('note', 'Note', 'textarea', { wide: true })];

const BY_TYPE: Partial<Record<CSLItemType, FieldSpec[]>> = {
  'article-journal': [
    TITLE,
    AUTHOR,
    F('container-title', 'Journal', 'text', { wide: true }),
    F('volume', 'Volume'),
    F('issue', 'Issue'),
    PAGE,
    ISSUED,
    DOI,
    F('ISSN', 'ISSN'),
    URL_FIELD,
  ],
  'article-magazine': [
    TITLE,
    AUTHOR,
    F('container-title', 'Magazine', 'text', { wide: true }),
    F('volume', 'Volume'),
    PAGE,
    ISSUED,
    URL_FIELD,
    ACCESSED,
  ],
  'article-newspaper': [
    TITLE,
    AUTHOR,
    F('container-title', 'Newspaper', 'text', { wide: true }),
    F('section', 'Section'),
    PAGE,
    ISSUED,
    URL_FIELD,
    ACCESSED,
  ],
  book: [TITLE, AUTHOR, EDITOR, PUBLISHER, PLACE, EDITION, ISSUED, F('ISBN', 'ISBN'), F('number-of-pages', 'Pages', 'number'), URL_FIELD],
  chapter: [
    TITLE,
    AUTHOR,
    F('container-title', 'Book title', 'text', { wide: true }),
    EDITOR,
    PUBLISHER,
    PLACE,
    EDITION,
    PAGE,
    ISSUED,
    F('ISBN', 'ISBN'),
  ],
  webpage: [
    TITLE,
    AUTHOR,
    F('container-title', 'Website name', 'text', { wide: true }),
    ISSUED,
    ACCESSED,
    URL_FIELD,
  ],
  'post-weblog': [TITLE, AUTHOR, F('container-title', 'Blog name', 'text', { wide: true }), ISSUED, ACCESSED, URL_FIELD],
  'paper-conference': [
    TITLE,
    AUTHOR,
    F('container-title', 'Proceedings', 'text', { wide: true }),
    F('event-title', 'Conference', 'text', { wide: true }),
    F('event-place', 'Conference location'),
    PUBLISHER,
    PAGE,
    ISSUED,
    DOI,
  ],
  thesis: [TITLE, AUTHOR, F('genre', 'Type', 'text', { placeholder: "PhD thesis" }), PUBLISHER, PLACE, ISSUED, URL_FIELD],
  report: [TITLE, AUTHOR, F('genre', 'Type', 'text', { placeholder: 'Technical report' }), PUBLISHER, F('number', 'Number'), ISSUED, URL_FIELD],
  dataset: [TITLE, AUTHOR, PUBLISHER, F('version', 'Version'), ISSUED, DOI, URL_FIELD],
  software: [TITLE, AUTHOR, PUBLISHER, F('version', 'Version'), ISSUED, URL_FIELD],
  'motion_picture': [TITLE, F('director', 'Director', 'names', { wide: true }), PUBLISHER, F('genre', 'Type'), ISSUED, URL_FIELD],
  broadcast: [TITLE, AUTHOR, F('container-title', 'Programme', 'text', { wide: true }), PUBLISHER, ISSUED, URL_FIELD],
  speech: [TITLE, AUTHOR, F('event-title', 'Event', 'text', { wide: true }), F('event-place', 'Location'), ISSUED, URL_FIELD],
  legislation: [TITLE, F('container-title', 'Collection', 'text', { wide: true }), F('number', 'Number'), ISSUED, URL_FIELD],
  legal_case: [TITLE, F('authority', 'Court'), F('number', 'Docket number'), ISSUED, URL_FIELD],
  patent: [TITLE, AUTHOR, F('authority', 'Authority'), F('number', 'Patent number'), ISSUED, URL_FIELD],
  manuscript: [TITLE, AUTHOR, PUBLISHER, PLACE, ISSUED, URL_FIELD],
  interview: [TITLE, AUTHOR, F('interviewer', 'Interviewer', 'names', { wide: true }), ISSUED, URL_FIELD],
  map: [TITLE, AUTHOR, PUBLISHER, PLACE, F('scale', 'Scale'), ISSUED, URL_FIELD],
  'entry-encyclopedia': [TITLE, AUTHOR, F('container-title', 'Encyclopedia', 'text', { wide: true }), EDITOR, PUBLISHER, PAGE, ISSUED],
};

const DEFAULT_FIELDS: FieldSpec[] = [TITLE, AUTHOR, F('container-title', 'Published in', 'text', { wide: true }), PUBLISHER, ISSUED, URL_FIELD, ACCESSED];

export function fieldsForType(type: CSLItemType): FieldSpec[] {
  return BY_TYPE[type] ?? DEFAULT_FIELDS;
}

/** Types offered in the picker, in the order people reach for them. */
export const COMMON_TYPES: Array<{ value: CSLItemType; label: string }> = [
  { value: 'webpage', label: 'Web page' },
  { value: 'article-journal', label: 'Journal article' },
  { value: 'book', label: 'Book' },
  { value: 'chapter', label: 'Book chapter' },
  { value: 'article-newspaper', label: 'Newspaper article' },
  { value: 'article-magazine', label: 'Magazine article' },
  { value: 'post-weblog', label: 'Blog post' },
  { value: 'paper-conference', label: 'Conference paper' },
  { value: 'thesis', label: 'Thesis or dissertation' },
  { value: 'report', label: 'Report' },
  { value: 'dataset', label: 'Dataset' },
  { value: 'software', label: 'Software' },
  { value: 'motion_picture', label: 'Film or video' },
  { value: 'broadcast', label: 'TV or radio broadcast' },
  { value: 'speech', label: 'Speech or lecture' },
  { value: 'interview', label: 'Interview' },
  { value: 'legislation', label: 'Legislation' },
  { value: 'legal_case', label: 'Court case' },
  { value: 'patent', label: 'Patent' },
  { value: 'map', label: 'Map' },
  { value: 'manuscript', label: 'Manuscript' },
];

export function typeLabel(type: CSLItemType): string {
  return COMMON_TYPES.find((t) => t.value === type)?.label ?? type.replace(/[-_]/g, ' ');
}
