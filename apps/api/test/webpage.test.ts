import { describe, expect, it } from 'vitest';
import { extractFromHTML } from '../api/_lib/resolvers/webpage';

const page = (head: string) => `<!doctype html><html><head>${head}</head><body><p>x</p></body></html>`;

describe('web page extraction', () => {
  it('reads Highwire citation tags, which publishers actually publish', async () => {
    // These are the tags Google Scholar reads. Nothing else on a journal page
    // carries a volume, an issue or a page range.
    const html = page(`
      <title>Nature | Article landing page</title>
      <meta name="citation_title" content="Nanometre-scale thermometry in a living cell">
      <meta name="citation_author" content="Kucsko, G.">
      <meta name="citation_author" content="Maurer, P. C.">
      <meta name="citation_journal_title" content="Nature">
      <meta name="citation_volume" content="500">
      <meta name="citation_issue" content="7460">
      <meta name="citation_firstpage" content="54">
      <meta name="citation_lastpage" content="58">
      <meta name="citation_publication_date" content="2013/07/31">
      <meta name="citation_issn" content="0028-0836">
    `);

    const { csl, source } = await extractFromHTML(html, 'https://nature.com/x', 'k');

    expect(source).toBe('highwire');
    expect(csl.type).toBe('article-journal');
    expect(csl.title).toBe('Nanometre-scale thermometry in a living cell');
    expect(csl['container-title']).toBe('Nature');
    expect(csl.volume).toBe('500');
    expect(csl.page).toBe('54-58');
    expect(csl.author).toHaveLength(2);
    expect(csl.author?.[0]).toEqual({ family: 'Kucsko', given: 'G.' });
    expect(csl.ISSN).toBe('0028-0836');
  });

  it('prefers the citation title over the page <title>', async () => {
    const html = page(`
      <title>Some Journal — Article page | Publisher</title>
      <meta name="citation_title" content="The actual article title">
    `);
    const { csl } = await extractFromHTML(html, 'https://example.com/a', 'k');
    expect(csl.title).toBe('The actual article title');
  });

  it('reads schema.org JSON-LD, including inside an @graph', async () => {
    const html = page(`
      <script type="application/ld+json">
      {"@graph":[
        {"@type":"WebSite","name":"The Times"},
        {"@type":"NewsArticle","headline":"A council votes","author":{"@type":"Person","name":"Jane Reporter"},
         "datePublished":"2021-04-05T10:00:00Z","publisher":{"@type":"Organization","name":"The Times"}}
      ]}
      </script>
    `);

    const { csl } = await extractFromHTML(html, 'https://thetimes.co.uk/a', 'k');

    expect(csl.type).toBe('article-newspaper');
    expect(csl.title).toBe('A council votes');
    expect(csl.author?.[0]).toEqual({ family: 'Reporter', given: 'Jane' });
    expect(csl.issued).toEqual({ 'date-parts': [[2021, 4, 5]] });
  });

  it('reads Dublin Core when that is all there is', async () => {
    const html = page(`
      <meta name="DC.title" content="A repository record">
      <meta name="DC.creator" content="Smith, Alice">
      <meta name="DC.date" content="2019-06">
      <meta name="DC.publisher" content="Some University">
    `);
    const { csl, source } = await extractFromHTML(html, 'https://repo.example/1', 'k');

    expect(source).toBe('dublin-core');
    expect(csl.title).toBe('A repository record');
    expect(csl.author?.[0]).toEqual({ family: 'Smith', given: 'Alice' });
    expect(csl.issued).toEqual({ 'date-parts': [[2019, 6]] });
  });

  it('falls back to Open Graph and metascraper for an ordinary page', async () => {
    const html = page(`
      <title>How to bake bread</title>
      <meta property="og:title" content="How to bake bread">
      <meta property="og:site_name" content="Cooking Weekly">
      <meta name="author" content="Sam Baker">
      <meta property="article:published_time" content="2022-11-02">
    `);

    const { csl, source } = await extractFromHTML(html, 'https://cooking.example/bread', 'k');

    expect(source).toBe('generic');
    expect(csl.title).toBe('How to bake bread');
    // For a web page the "container" is the site — what styles call the
    // website name.
    expect(csl['container-title']).toBe('Cooking Weekly');
    expect(csl.author?.[0]).toEqual({ family: 'Baker', given: 'Sam' });
    expect(csl.issued).toEqual({ 'date-parts': [[2022, 11, 2]] });
  });

  it('always stamps an access date on a scraped page', async () => {
    // Web pages change; styles require the date the reader saw it.
    const { csl } = await extractFromHTML(page('<title>x</title>'), 'https://e.com/', 'k');
    expect(csl.accessed?.['date-parts']?.[0]).toHaveLength(3);
  });

  it('surfaces a DOI the page declares, so the registry can be used instead', async () => {
    const html = page(`
      <meta name="citation_title" content="A paper">
      <meta name="citation_doi" content="10.1038/nature12373">
    `);
    const { doi } = await extractFromHTML(html, 'https://example.com/a', 'k');
    expect(doi).toBe('10.1038/nature12373');
  });

  it('finds a DOI in a link when there is no meta tag for it', async () => {
    const html = `<!doctype html><html><head><title>A paper</title></head>
      <body><a href="https://doi.org/10.1234/abc.def">DOI</a></body></html>`;
    const { doi } = await extractFromHTML(html, 'https://example.com/a', 'k');
    expect(doi).toBe('10.1234/abc.def');
  });

  it('survives malformed JSON-LD instead of failing the whole lookup', async () => {
    const html = page(`
      <title>Still readable</title>
      <script type="application/ld+json">{ this is not json }</script>
    `);
    const { csl } = await extractFromHTML(html, 'https://example.com/a', 'k');
    expect(csl.title).toBe('Still readable');
  });

  it('infers a thesis or a report from the institution tags', async () => {
    const thesis = page(`
      <meta name="citation_title" content="On things">
      <meta name="citation_dissertation_institution" content="Some University">
    `);
    expect((await extractFromHTML(thesis, 'https://e.com/', 'k')).csl.type).toBe('thesis');

    const report = page(`
      <meta name="citation_title" content="Annual figures">
      <meta name="citation_technical_report_institution" content="An Agency">
    `);
    expect((await extractFromHTML(report, 'https://e.com/', 'k')).csl.type).toBe('report');
  });
});

describe('placeholder and duplicate cleanup', () => {
  it('drops template placeholder authors', async () => {
    // citationstyles.org really does ship `content="Your Name"` — the Jekyll
    // default. Left alone, every citation of it credits a person of that name.
    const html = page(`
      <title>Citation Style Language</title>
      <meta name="author" content="Your Name">
      <meta property="og:site_name" content="CSL Project">
    `);
    const { csl } = await extractFromHTML(html, 'https://citationstyles.org/', 'k');
    expect(csl.author).toBeUndefined();
  });

  it('keeps a real author that merely looks ordinary', async () => {
    const html = page(`<title>x</title><meta name="author" content="Sam Baker">`);
    const { csl } = await extractFromHTML(html, 'https://e.com/', 'k');
    expect(csl.author?.[0]).toEqual({ family: 'Baker', given: 'Sam' });
  });

  it('does not repeat the title as the website name', async () => {
    // Sites commonly set og:site_name to the same text as og:title on a home
    // page; printing both reads as a mistake in every style.
    const html = page(`
      <meta property="og:title" content="Citation Style Language">
      <meta property="og:site_name" content="Citation Style Language">
    `);
    const { csl } = await extractFromHTML(html, 'https://citationstyles.org/', 'k');
    expect(csl.title).toBe('Citation Style Language');
    expect(csl['container-title']).toBeUndefined();
  });

  it('keeps a website name that differs from the title', async () => {
    const html = page(`
      <meta property="og:title" content="How to bake bread">
      <meta property="og:site_name" content="Cooking Weekly">
    `);
    const { csl } = await extractFromHTML(html, 'https://e.com/', 'k');
    expect(csl['container-title']).toBe('Cooking Weekly');
  });
});
