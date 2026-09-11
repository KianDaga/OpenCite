import * as cheerio from 'cheerio';
import metascraper from 'metascraper';
import msAuthor from 'metascraper-author';
import msDate from 'metascraper-date';
import msPublisher from 'metascraper-publisher';
import msTitle from 'metascraper-title';
import msDescription from 'metascraper-description';
import msLang from 'metascraper-lang';
import type { CSLItem, CSLItemType, LookupResult } from '@opencite/shared';
import {
  accessedToday,
  compactCSL,
  normalizeDOI,
  parseDate,
  parseName,
  parseNames,
  resolveCrossrefDOI,
  resolveDataCiteDOI,
} from '@opencite/shared';
import { fetchJSON } from '../http';

/**
 * Web pages, in priority order.
 *
 * Metascraper is excellent at the generic question "what is this article and
 * who wrote it", which is why it handles the fallback layer. But it is built
 * for content, not citations: it has no notion of a journal name, a volume, a
 * DOI or an issue number. Publishers do expose exactly that, through Highwire
 * Press `citation_*` tags (the ones Google Scholar reads), Dublin Core, and
 * schema.org — so those are read first and metascraper fills the gaps.
 *
 * And when the page names a DOI, the page is abandoned in favour of the
 * registry: scraped metadata from a landing page is a guess, a Crossref
 * record is the publisher's own deposit.
 */

const scraper = metascraper([
  msTitle(),
  msAuthor(),
  msDate(),
  msPublisher(),
  msDescription(),
  msLang(),
]);

type Meta = Record<string, string[]>;

/** Collects every `<meta>` by lowercased name/property, keeping duplicates. */
function readMeta($: cheerio.CheerioAPI): Meta {
  const meta: Meta = {};
  $('meta').each((_, element) => {
    const node = $(element);
    const name = (node.attr('name') ?? node.attr('property') ?? node.attr('itemprop') ?? '')
      .trim()
      .toLowerCase();
    const content = node.attr('content')?.trim();
    if (!name || !content) return;
    (meta[name] ??= []).push(content);
  });
  return meta;
}

const first = (meta: Meta, ...names: string[]): string | undefined => {
  for (const name of names) {
    const value = meta[name]?.[0];
    if (value) return value;
  }
  return undefined;
};

const all = (meta: Meta, ...names: string[]): string[] => {
  for (const name of names) {
    const values = meta[name];
    if (values?.length) return values;
  }
  return [];
};

/**
 * Values that appear in `<meta name="author">` because nobody edited the site
 * template, not because a person wrote the page.
 *
 * citationstyles.org ships with `content="Your Name"` — the Jekyll default —
 * and without this filter every citation of it credits an author called Your
 * Name. Deliberately short and literal: the cost of dropping a real author is
 * far higher than leaving one placeholder through, so only exact matches for
 * known template defaults are removed.
 */
const PLACEHOLDER_NAMES = new Set([
  'your name',
  'name',
  'author',
  'author name',
  'admin',
  'administrator',
  'site administrator',
  'webmaster',
  'editor',
  'unknown',
  'unknown author',
  'n/a',
  'none',
  'null',
  'undefined',
  'user',
  'test',
  'example',
  'first last',
  'firstname lastname',
  'john doe',
  'lorem ipsum',
]);

export function isPlaceholderName(value: string): boolean {
  const normalised = value.trim().toLowerCase().replace(/[.,\s]+$/, '');
  return normalised.length < 2 || PLACEHOLDER_NAMES.has(normalised);
}

interface JsonLd {
  '@type'?: string | string[];
  headline?: string;
  name?: string;
  author?: unknown;
  datePublished?: string;
  dateModified?: string;
  publisher?: { name?: string } | string;
  isPartOf?: { name?: string };
  inLanguage?: string;
  description?: string;
  isbn?: string;
}

/** schema.org blocks, flattened out of `@graph` wrappers. */
function readJsonLd($: cheerio.CheerioAPI): JsonLd[] {
  const blocks: JsonLd[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of queue) {
        const node = entry as { '@graph'?: unknown[] };
        if (Array.isArray(node['@graph'])) blocks.push(...(node['@graph'] as JsonLd[]));
        else blocks.push(entry as JsonLd);
      }
    } catch {
      // Malformed JSON-LD is common; the other sources still apply.
    }
  });
  return blocks;
}

/**
 * Types that describe the *work*, as opposed to the site it sits on.
 *
 * A page's `@graph` usually mixes both: a `WebSite`, an `Organization`, a
 * `BreadcrumbList` and — somewhere among them — the article. Picking the first
 * block with a name attaches the publication's name to the citation as its
 * title, which is wrong in a way that looks plausible.
 */
const WORK_TYPES = new Set([
  'ScholarlyArticle',
  'NewsArticle',
  'ReportageNewsArticle',
  'AnalysisNewsArticle',
  'OpinionNewsArticle',
  'BlogPosting',
  'Article',
  'TechArticle',
  'Book',
  'Report',
  'Dataset',
  'VideoObject',
  'PodcastEpisode',
]);

function blockTypes(block: JsonLd): string[] {
  const raw = block['@type'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

export function pickWorkBlock(blocks: JsonLd[]): JsonLd | undefined {
  return (
    blocks.find((b) => blockTypes(b).some((t) => WORK_TYPES.has(t))) ??
    // No declared work type: a headline still means an article; a bare `name`
    // does not, so it is the last resort.
    blocks.find((b) => b.headline) ??
    blocks.find((b) => blockTypes(b).includes('WebPage'))
  );
}

function jsonLdAuthors(author: unknown): string[] {
  if (!author) return [];
  const list = Array.isArray(author) ? author : [author];
  return list
    .map((entry) =>
      typeof entry === 'string' ? entry : ((entry as { name?: string })?.name ?? ''),
    )
    .filter(Boolean);
}

const SCHEMA_TYPE_MAP: Record<string, CSLItemType> = {
  ScholarlyArticle: 'article-journal',
  NewsArticle: 'article-newspaper',
  ReportageNewsArticle: 'article-newspaper',
  AnalysisNewsArticle: 'article-newspaper',
  OpinionNewsArticle: 'article-newspaper',
  BlogPosting: 'post-weblog',
  Article: 'article-magazine',
  TechArticle: 'article-magazine',
  Book: 'book',
  Report: 'report',
  Dataset: 'dataset',
  VideoObject: 'motion_picture',
  PodcastEpisode: 'broadcast',
  WebPage: 'webpage',
};

function inferType(meta: Meta, blocks: JsonLd[]): CSLItemType {
  // A journal name in the citation tags is the strongest signal there is.
  if (first(meta, 'citation_journal_title')) return 'article-journal';
  if (first(meta, 'citation_conference_title')) return 'paper-conference';
  if (first(meta, 'citation_dissertation_institution')) return 'thesis';
  if (first(meta, 'citation_technical_report_institution')) return 'report';
  if (first(meta, 'citation_isbn')) return 'chapter';

  for (const block of blocks) {
    const types = Array.isArray(block['@type']) ? block['@type'] : [block['@type'] ?? ''];
    for (const type of types) {
      const mapped = SCHEMA_TYPE_MAP[type];
      if (mapped) return mapped;
    }
  }

  const ogType = first(meta, 'og:type');
  if (ogType === 'article') return 'article-newspaper';
  if (ogType === 'book') return 'book';
  if (ogType === 'video.other' || ogType === 'video.movie') return 'motion_picture';

  return 'webpage';
}

/** Any DOI the page declares about itself. */
export function findDOI(meta: Meta, $: cheerio.CheerioAPI): string | undefined {
  const declared = first(meta, 'citation_doi', 'dc.identifier.doi', 'doi', 'dc.identifier');
  if (declared && /10\.\d{4,9}\//.test(declared)) return normalizeDOI(declared);

  const link = $('a[href*="doi.org/10."]').first().attr('href');
  if (link) return normalizeDOI(link);

  return undefined;
}

export interface PageMetadata {
  csl: CSLItem;
  doi?: string;
  /** Which layer supplied the bulk of the fields — reported as confidence. */
  source: 'highwire' | 'json-ld' | 'dublin-core' | 'generic';
}

export async function extractFromHTML(
  html: string,
  url: string,
  id: string,
): Promise<PageMetadata> {
  const $ = cheerio.load(html);
  const meta = readMeta($);
  const blocks = readJsonLd($);
  const article = pickWorkBlock(blocks);

  // Metascraper is the floor, not the ceiling: run it, then overwrite
  // anything the citation-specific tags know better.
  const generic = await scraper({ html, url }).catch(() => ({}) as Record<string, string>);

  const highwireTitle = first(meta, 'citation_title');
  const dcTitle = first(meta, 'dc.title', 'dcterms.title');

  const title =
    highwireTitle ??
    dcTitle ??
    article?.headline ??
    article?.name ??
    first(meta, 'og:title', 'twitter:title') ??
    generic.title ??
    $('title').first().text().trim() ??
    undefined;

  const authorStrings = ((): string[] => {
    const highwire = all(meta, 'citation_author');
    if (highwire.length) return highwire;
    const dc = all(meta, 'dc.creator', 'dcterms.creator');
    if (dc.length) return dc;
    const jsonLd = jsonLdAuthors(article?.author);
    if (jsonLd.length) return jsonLd;
    const og = all(meta, 'article:author', 'author');
    // `article:author` is often a profile URL rather than a name.
    if (og.length) return og.filter((a) => !a.startsWith('http'));
    return generic.author ? [generic.author] : [];
  })().filter((name) => !isPlaceholderName(name));

  const dateString =
    first(meta, 'citation_publication_date', 'citation_date', 'citation_online_date') ??
    first(meta, 'dc.date', 'dcterms.issued', 'dc.date.issued') ??
    article?.datePublished ??
    first(meta, 'article:published_time', 'og:published_time') ??
    generic.date;

  const containerTitle =
    first(meta, 'citation_journal_title', 'citation_conference_title', 'citation_inbook_title') ??
    first(meta, 'dc.source') ??
    article?.isPartOf?.name;

  const siteName =
    first(meta, 'og:site_name') ??
    (typeof article?.publisher === 'string' ? article.publisher : article?.publisher?.name) ??
    generic.publisher ??
    first(meta, 'citation_publisher', 'dc.publisher');

  const type = inferType(meta, blocks);
  const isWebpage = type === 'webpage' || type === 'post-weblog';

  // Many sites set og:site_name to the same string as og:title, especially on
  // a home page. Repeating the title as the website name reads as a mistake in
  // every style, so drop it rather than print it twice.
  const container = containerTitle ?? (isWebpage ? siteName : undefined);
  const containerIsDistinct =
    container && container.trim().toLowerCase() !== title?.trim().toLowerCase();

  const csl = compactCSL({
    id,
    type,
    title: title?.trim(),
    // For a journal article the container is the journal; for a web page it is
    // the site, which is what styles ask for as "website name".
    'container-title': containerIsDistinct ? container : undefined,
    publisher: isWebpage ? undefined : (first(meta, 'citation_publisher', 'dc.publisher') ?? siteName),
    'publisher-place': first(meta, 'citation_publisher_place'),
    // `authorStrings` already includes metascraper's answer as its last
    // resort, so there is no second fallback here — one would reintroduce the
    // placeholder names just filtered out.
    author: authorStrings.flatMap((name) => parseNames(name)),
    editor: all(meta, 'citation_editor').map(parseName),
    volume: first(meta, 'citation_volume'),
    issue: first(meta, 'citation_issue'),
    page: (() => {
      const firstPage = first(meta, 'citation_firstpage');
      const lastPage = first(meta, 'citation_lastpage');
      if (!firstPage) return undefined;
      return lastPage ? `${firstPage}-${lastPage}` : firstPage;
    })(),
    ISSN: first(meta, 'citation_issn'),
    ISBN: first(meta, 'citation_isbn') ?? article?.isbn,
    DOI: first(meta, 'citation_doi'),
    URL: first(meta, 'og:url', 'citation_public_url') ?? url,
    language: first(meta, 'citation_language', 'dc.language') ?? article?.inLanguage ?? generic.lang,
    abstract:
      first(meta, 'citation_abstract', 'dc.description') ??
      article?.description ??
      generic.description,
    issued: parseDate(dateString),
    accessed: accessedToday(),
  });

  const source: PageMetadata['source'] = highwireTitle
    ? 'highwire'
    : article
      ? 'json-ld'
      : dcTitle
        ? 'dublin-core'
        : 'generic';

  const doi = findDOI(meta, $);
  return { csl, ...(doi ? { doi } : {}), source };
}

/** Confidence by how citation-aware the page turned out to be. */
const CONFIDENCE: Record<PageMetadata['source'], number> = {
  highwire: 0.9,
  'json-ld': 0.75,
  'dublin-core': 0.75,
  generic: 0.6,
};

export async function resolveWebpage(
  html: string,
  url: string,
  key: string,
): Promise<LookupResult[]> {
  const page = await extractFromHTML(html, url, key);

  // The page named a DOI: the registry knows better than the landing page.
  if (page.doi) {
    const registry =
      (await resolveCrossrefDOI(page.doi, fetchJSON)) ??
      (await resolveDataCiteDOI(page.doi, fetchJSON));
    if (registry) {
      return [
        {
          ...registry,
          csl: {
            ...registry.csl,
            id: key,
            // Keep what only the page knows: where the reader actually found
            // it, and when.
            URL: registry.csl.URL ?? url,
            accessed: accessedToday(),
          },
          key,
        },
      ];
    }
  }

  if (!page.csl.title) return [];

  return [
    {
      csl: page.csl,
      resolver: 'metascraper',
      key,
      confidence: CONFIDENCE[page.source],
    },
  ];
}
