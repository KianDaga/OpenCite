/**
 * Hands the browser a file.
 *
 * An object URL rather than a data: URI because data: URIs are capped at a few
 * megabytes in some browsers and a large library would silently fail. The URL
 * is revoked after the click so the blob does not sit in memory for the life
 * of the tab.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mimeType: string): void {
  // The BOM is deliberate: Word and Excel read a UTF-8 file without one as
  // the local codepage, which mangles every accented author name.
  downloadBlob(new Blob([`﻿${text}`], { type: `${mimeType};charset=utf-8` }), filename);
}

/** A filesystem-safe filename derived from the project name. */
export function safeFilename(name: string, extension: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'bibliography';
  return `${base}.${extension}`;
}
