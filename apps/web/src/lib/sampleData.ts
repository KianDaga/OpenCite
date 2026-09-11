import type { CSLItem } from '@opencite/shared';

/**
 * Example references for the development shell, so the formatter has
 * something to format before Step 3's lookups exist. One of each shape that
 * styles treat differently: a journal article, a book, a chapter and a web
 * page.
 */
export const SAMPLE_REFERENCES: Array<Omit<CSLItem, 'id'>> = [
  {
    type: 'article-journal',
    title: 'Attention is all you need',
    'container-title': 'Advances in Neural Information Processing Systems',
    author: [
      { family: 'Vaswani', given: 'Ashish' },
      { family: 'Shazeer', given: 'Noam' },
      { family: 'Parmar', given: 'Niki' },
    ],
    volume: '30',
    page: '5998-6008',
    issued: { 'date-parts': [[2017]] },
    DOI: '10.48550/arXiv.1706.03762',
  },
  {
    type: 'book',
    title: 'The human condition',
    author: [{ family: 'Arendt', given: 'Hannah' }],
    publisher: 'University of Chicago Press',
    'publisher-place': 'Chicago',
    issued: { 'date-parts': [[1958]] },
    ISBN: '9780226025988',
  },
  {
    type: 'chapter',
    title: 'The social life of information systems',
    'container-title': 'Handbook of information science',
    author: [{ family: 'Brown', given: 'John Seely' }],
    editor: [{ family: 'Duguid', given: 'Paul' }],
    publisher: 'Harvard Business Review Press',
    page: '121-145',
    issued: { 'date-parts': [[2000]] },
  },
  {
    type: 'webpage',
    title: 'Citation Style Language',
    'container-title': 'citationstyles.org',
    URL: 'https://citationstyles.org/',
    accessed: { 'date-parts': [[2026, 9, 11]] },
  },
];
