#!/usr/bin/env node
/**
 * Vendors CSL styles and locales into `public/csl/` so a deployment can run
 * without reaching a CDN at all — useful for offline installs, for
 * institutions that block third-party requests, and for pinning a known-good
 * set of styles rather than tracking the repository's master branch.
 *
 *   node scripts/fetch-styles.mjs              # the default catalog
 *   node scripts/fetch-styles.mjs apa ieee     # named styles only
 *
 * `cslSource.ts` already prefers `/csl/...` over the CDN, so anything vendored
 * here is picked up with no code change.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES_CDN = 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master';
const LOCALES_CDN = 'https://cdn.jsdelivr.net/gh/citation-style-language/locales@master';

/** Kept in step with `src/citation/styleCatalog.ts`. */
const DEFAULT_STYLES = [
  'apa',
  'apa-6th-edition',
  'modern-language-association',
  'harvard-cite-them-right',
  'chicago-notes-bibliography',
  'chicago-author-date',
  'ieee',
  'american-medical-association',
  'american-chemical-society',
  'american-sociological-association',
  'american-political-science-association',
  'american-institute-of-physics',
  'turabian-notes-bibliography',
  'turabian-author-date',
  'nature',
  'science',
  'cell',
  'the-lancet',
  'bmj',
  'elsevier-harvard',
  'springer-basic-author-date',
  'acm-sig-proceedings',
];

const DEFAULT_LOCALES = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'nl-NL', 'pt-BR'];

/**
 * Every request gets a deadline.
 *
 * Without one a hung connection blocks this script forever, and a build step
 * that hangs is worse than one that fails: CI has no way to tell it apart from
 * slow work, so it sits there until the job's timeout — six hours, by default.
 * Failing fast lets the caller fall back to the CDN at runtime.
 */
const REQUEST_TIMEOUT_MS = 15_000;

async function download(label, urls) {
  for (const url of urls) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => null);

    if (response?.ok) {
      const text = await response.text().catch(() => '');
      if (text.trimStart().startsWith('<')) return text;
    }
  }
  throw new Error(`could not fetch ${label}`);
}

async function main() {
  const requested = process.argv.slice(2);
  const styles = requested.length > 0 ? requested : DEFAULT_STYLES;

  await mkdir(join(ROOT, 'public/csl/styles'), { recursive: true });
  await mkdir(join(ROOT, 'public/csl/locales'), { recursive: true });

  let ok = 0;
  const failed = [];

  // If the very first style cannot be reached, the CSL repository is not
  // available from here — stop rather than spending a request timeout on each
  // of the thirty that follow. Vendoring is an optimisation; the app falls
  // back to the CDN at runtime, so giving up quickly costs nothing.
  let reachable = true;

  for (const id of styles) {
    if (!reachable) {
      failed.push(`${id}: skipped, the CSL repository is unreachable`);
      continue;
    }
    try {
      // Dependent styles live in their own directory; try both.
      const xml = await download(`style ${id}`, [
        `${STYLES_CDN}/${id}.csl`,
        `${STYLES_CDN}/dependent/${id}.csl`,
      ]);
      await writeFile(join(ROOT, 'public/csl/styles', `${id}.csl`), xml);

      // A dependent style is useless without the parent it points at.
      const parent = /<link[^>]+href="([^"]+)"[^>]+rel="independent-parent"/.exec(xml)?.[1];
      if (parent) {
        const parentId = parent.split('/').pop();
        const parentXml = await download(`parent style ${parentId}`, [
          `${STYLES_CDN}/${parentId}.csl`,
        ]);
        await writeFile(join(ROOT, 'public/csl/styles', `${parentId}.csl`), parentXml);
        console.log(`  ${id} → also vendored parent ${parentId}`);
      }
      ok += 1;
    } catch (error) {
      failed.push(`${id}: ${error.message}`);
      if (ok === 0) reachable = false;
    }
  }

  for (const id of DEFAULT_LOCALES) {
    if (!reachable) {
      failed.push(`locale ${id}: skipped, the CSL repository is unreachable`);
      continue;
    }
    try {
      const xml = await download(`locale ${id}`, [`${LOCALES_CDN}/locales-${id}.xml`]);
      await writeFile(join(ROOT, 'public/csl/locales', `locales-${id}.xml`), xml);
      ok += 1;
    } catch (error) {
      failed.push(`locale ${id}: ${error.message}`);
    }
  }

  console.log(`\nVendored ${ok} files into public/csl/`);
  if (failed.length > 0) {
    console.error(`\n${failed.length} failed:`);
    for (const line of failed) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

await main();
