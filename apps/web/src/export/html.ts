import type { BibliographyLayout } from '@/citation';

/**
 * A standalone HTML file of the bibliography.
 *
 * Self-contained on purpose: the CSS is inlined, so the file opens correctly
 * from a download folder, an email attachment or a USB stick years from now,
 * with nothing to fetch. The layout rules come from citeproc's metadata, the
 * same as on screen, so a numeric style exports with its gutter rather than a
 * hanging indent.
 */
export function toHTMLDocument(
  entries: string[],
  options: { title?: string; styleTitle?: string; layout?: BibliographyLayout } = {},
): string {
  const title = options.title ?? 'Bibliography';
  const layout = options.layout;

  const entryRules = layout?.hangingIndent
    ? '.csl-entry { padding-left: 2em; text-indent: -2em; }'
    : layout?.secondFieldAlign
      ? `.csl-entry { display: flex; gap: 0.5em; }
    .csl-left-margin { flex: 0 0 ${Math.max(layout.maxOffset, 1)}ch; }
    .csl-right-inline { flex: 1 1 auto; }`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<style>
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.6;
    max-width: 42rem;
    margin: 3rem auto;
    padding: 0 1.5rem;
    color: #111;
  }
  h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
  .meta { color: #666; font-size: 0.8rem; margin-bottom: 2rem; font-family: system-ui, sans-serif; }
  .csl-entry { margin-bottom: 0.75rem; }
  ${entryRules}
  @media print {
    body { margin: 0; max-width: none; }
    .meta { display: none; }
  }
</style>
</head>
<body>
<h1>${escapeHTML(title)}</h1>
${options.styleTitle ? `<p class="meta">${escapeHTML(options.styleTitle)}</p>` : ''}
<div class="csl-bib-body">
${entries.join('\n')}
</div>
</body>
</html>
`;
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
