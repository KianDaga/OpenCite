import type { CSLItem } from '@opencite/shared';

/**
 * The export menu, as data.
 *
 * Two families, and the difference matters to the user: a *bibliography*
 * export is formatted prose in their chosen citation style and is finished
 * work; a *library* export is the underlying metadata, for moving into Zotero,
 * EndNote or a LaTeX project. Presenting them as one undifferentiated list of
 * file types is what makes people pick the wrong one.
 */
export type ExportFamily = 'bibliography' | 'library';

export interface ExportFormat {
  id: 'html' | 'docx' | 'text' | 'bibtex' | 'ris' | 'csl-json';
  label: string;
  description: string;
  family: ExportFamily;
  extension: string;
  mimeType: string;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'docx',
    label: 'Word document',
    description: 'Formatted in your citation style, with the hanging indent as a real Word setting.',
    family: 'bibliography',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    id: 'html',
    label: 'Web page',
    description: 'A self-contained HTML file that opens anywhere, with nothing to fetch.',
    family: 'bibliography',
    extension: 'html',
    mimeType: 'text/html',
  },
  {
    id: 'text',
    label: 'Plain text',
    description: 'Formatting removed. For places that will not take rich text.',
    family: 'bibliography',
    extension: 'txt',
    mimeType: 'text/plain',
  },
  {
    id: 'bibtex',
    label: 'BibTeX',
    description: 'For LaTeX. Cite keys are generated and made unique.',
    family: 'library',
    extension: 'bib',
    mimeType: 'application/x-bibtex',
  },
  {
    id: 'ris',
    label: 'RIS',
    description: 'For EndNote, Mendeley, RefWorks and most reference managers.',
    family: 'library',
    extension: 'ris',
    mimeType: 'application/x-research-info-systems',
  },
  {
    id: 'csl-json',
    label: 'CSL JSON',
    description: 'The raw metadata, exactly as OpenCite stores it. Zotero reads this.',
    family: 'library',
    extension: 'json',
    mimeType: 'application/json',
  },
];

/** CSL JSON export: the stored payload, with nothing of ours added. */
export function toCSLJSON(items: CSLItem[]): string {
  return JSON.stringify(items, null, 2);
}
