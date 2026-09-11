import type { CSLItem, CSLItemType } from '../csl';
import type { LookupResult } from '../api';
import type { JSONFetcher } from './fetcher';
import { compactCSL, parseName, stripMarkup } from '../cslBuild';

/**
 * DataCite — the other half of the DOI world.
 *
 * Crossref registers journal literature; DataCite registers datasets,
 * preprints, software and theses (Zenodo, Dryad, figshare, institutional
 * repositories). A DOI that Crossref does not know is very often one of
 * these, so it is the fallback rather than a separate endpoint.
 *
 * Usefully, DataCite publishes its own CSL type mapping in `types.citeproc`,
 * so unlike Crossref there is no vocabulary to guess at.
 */

const API = 'https://api.datacite.org/dois';

interface DataCiteCreator {
  name?: string;
  nameType?: 'Personal' | 'Organizational';
  givenName?: string;
  familyName?: string;
}

interface DataCiteAttributes {
  doi?: string;
  titles?: Array<{ title?: string }>;
  creators?: DataCiteCreator[];
  contributors?: DataCiteCreator[];
  publisher?: string | { name?: string };
  publicationYear?: number;
  types?: { citeproc?: string; resourceTypeGeneral?: string };
  url?: string;
  language?: string;
  version?: string;
  descriptions?: Array<{ description?: string; descriptionType?: string }>;
  container?: { title?: string; volume?: string; issue?: string };
}

function toName(creator: DataCiteCreator) {
  if (creator.nameType === 'Organizational') return { literal: creator.name ?? '' };
  if (creator.familyName) {
    return { family: creator.familyName, given: creator.givenName ?? '' };
  }
  return parseName(creator.name ?? '');
}

export function dataciteToCSL(attributes: DataCiteAttributes, id: string): CSLItem {
  const publisher =
    typeof attributes.publisher === 'string' ? attributes.publisher : attributes.publisher?.name;

  const abstract = attributes.descriptions?.find(
    (d) => d.descriptionType === 'Abstract',
  )?.description;

  return compactCSL({
    id,
    type: (attributes.types?.citeproc as CSLItemType) ?? 'dataset',
    title: attributes.titles?.[0]?.title,
    author: (attributes.creators ?? []).map(toName),
    editor: (attributes.contributors ?? []).map(toName),
    publisher,
    'container-title': attributes.container?.title,
    volume: attributes.container?.volume,
    issue: attributes.container?.issue,
    version: attributes.version,
    DOI: attributes.doi,
    URL: attributes.url,
    language: attributes.language,
    abstract: stripMarkup(abstract),
    issued: attributes.publicationYear
      ? { 'date-parts': [[attributes.publicationYear]] }
      : undefined,
  });
}

export async function resolveDataCiteDOI(doi: string, fetchJSON: JSONFetcher): Promise<LookupResult | undefined> {
  const response = await fetchJSON<{ data?: { attributes?: DataCiteAttributes } }>(
    `${API}/${encodeURIComponent(doi)}`,
  );
  const attributes = response?.data?.attributes;
  if (!attributes?.doi) return undefined;

  return {
    csl: dataciteToCSL(attributes, doi),
    resolver: 'datacite',
    key: `doi:${doi.toLowerCase()}`,
    confidence: 0.95,
  };
}
