import type { BibliographyLayout } from '@/citation';

/**
 * A Word document of the bibliography.
 *
 * Two problems to solve. First, citeproc emits HTML — `<i>`, `<b>`, `<span>`,
 * and for numeric styles a pair of nested divs — while Word wants a run per
 * formatting change, so the markup has to be parsed into runs rather than
 * stripped. Second, the hanging indent has to be a real Word paragraph
 * property, not spaces: a reader who edits the document expects the indent to
 * survive, and APA requires it.
 *
 * The `docx` library is ~1 MB, so it is imported only when an export actually
 * happens.
 */

/** One stretch of text with its formatting, flattened out of the HTML. */
export interface Run {
  text: string;
  italic?: boolean;
  bold?: boolean;
  superscript?: boolean;
  smallCaps?: boolean;
}

/** One bibliography entry: a label (numeric styles) and the text. */
export interface ParsedEntry {
  label?: Run[];
  body: Run[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Turns one citeproc HTML entry into runs.
 *
 * Written as a small tag scanner rather than with DOMParser so it can run in a
 * worker or a test without a DOM, and so unknown tags degrade to plain text
 * instead of throwing.
 */
export function parseEntry(html: string): ParsedEntry {
  const label = extractSection(html, 'csl-left-margin');
  const body = extractSection(html, 'csl-right-inline');

  if (label !== null && body !== null) {
    return { label: runsFrom(label), body: runsFrom(body) };
  }
  return { body: runsFrom(html) };
}

/** Pulls the inner HTML of the first `<div class="…">` with this class. */
function extractSection(html: string, className: string): string | null {
  const open = new RegExp(`<div[^>]*class="[^"]*${className}[^"]*"[^>]*>`, 'i').exec(html);
  if (!open) return null;

  const start = open.index + open[0].length;
  let depth = 1;
  let cursor = start;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;

  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      cursor = match.index;
      return html.slice(start, cursor);
    }
  }
  return html.slice(start);
}

const FORMATTING: Record<string, keyof Omit<Run, 'text'>> = {
  i: 'italic',
  em: 'italic',
  b: 'bold',
  strong: 'bold',
  sup: 'superscript',
};

export function runsFrom(html: string): Run[] {
  const runs: Run[] = [];
  const stack: Array<Partial<Run>> = [];
  const tokens = html.split(/(<[^>]+>)/);

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith('<')) {
      const close = token.startsWith('</');
      const name = /^<\/?\s*([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase();
      if (!name) continue;

      // citeproc marks small-caps with a style attribute rather than a tag.
      const smallCaps = /font-variant:\s*small-caps/i.test(token);
      const format = FORMATTING[name];

      if (close) {
        if (format || smallCaps) stack.pop();
      } else if (!token.endsWith('/>')) {
        if (format) stack.push({ [format]: true });
        else if (smallCaps) stack.push({ smallCaps: true });
      }
      continue;
    }

    const text = decodeEntities(token);
    if (!text) continue;

    const active = stack.reduce<Partial<Run>>((acc, entry) => ({ ...acc, ...entry }), {});
    const previous = runs[runs.length - 1];

    // Merge adjacent runs with identical formatting — Word files are smaller
    // and edit more cleanly without a run boundary every few characters.
    if (
      previous &&
      previous.italic === active.italic &&
      previous.bold === active.bold &&
      previous.superscript === active.superscript &&
      previous.smallCaps === active.smallCaps
    ) {
      previous.text += text;
    } else {
      runs.push({ text, ...active });
    }
  }

  return runs.filter((run) => run.text !== '');
}

export interface DocxOptions {
  title?: string;
  styleTitle?: string;
  layout?: BibliographyLayout;
  /** Font name as Word knows it, e.g. "Times New Roman". */
  fontFamily?: string;
  /** Point size. Word stores half-points, so this is doubled on the way in. */
  fontSize?: number;
}

/** Word measures indents in twips: 1 inch = 1440, so a 0.5" indent is 720. */
const HALF_INCH_TWIPS = 720;

export async function toDocxBlob(entries: string[], options: DocxOptions = {}): Promise<Blob> {
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');

  const parsed = entries.map(parseEntry);
  const layout = options.layout;

  const toTextRuns = (runs: Run[]) =>
    runs.map(
      (run) =>
        new TextRun({
          text: run.text,
          italics: run.italic ?? false,
          bold: run.bold ?? false,
          ...(run.superscript ? { superScript: true } : {}),
          ...(run.smallCaps ? { smallCaps: true } : {}),
        }),
    );

  const body = parsed.map((entry) => {
    const runs = entry.label ? [...toTextRuns(entry.label), new TextRun('\t'), ...toTextRuns(entry.body)] : toTextRuns(entry.body);

    return new Paragraph({
      children: runs,
      spacing: { after: 200, line: 360 },
      // A real paragraph property, so the indent survives editing in Word.
      indent: layout?.hangingIndent
        ? { left: HALF_INCH_TWIPS, hanging: HALF_INCH_TWIPS }
        : entry.label
          ? { left: HALF_INCH_TWIPS, hanging: HALF_INCH_TWIPS }
          : undefined,
    });
  });

  const document = new Document({
    creator: 'OpenCite',
    styles: {
      default: {
        document: {
          run: {
            font: options.fontFamily ?? 'Times New Roman',
            // Word measures in half-points.
            size: (options.fontSize ?? 12) * 2,
          },
        },
      },
    },
    title: options.title ?? 'Bibliography',
    description: options.styleTitle ?? '',
    sections: [
      {
        children: [
          new Paragraph({
            text: options.title ?? 'Bibliography',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
          }),
          ...body,
        ],
      },
    ],
  });

  return Packer.toBlob(document);
}
