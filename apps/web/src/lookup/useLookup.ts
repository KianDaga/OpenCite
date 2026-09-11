import { useCallback, useRef, useState } from 'react';
import type { CSLItemType, LookupResult } from '@opencite/shared';
import { useLibraryActions } from '@/state';
import { cslForStorage, lookupMetadata, sourceFor } from './client';
import { LookupError, UrlLookupUnavailable } from './errors';

/**
 * Drives the Autocite bar.
 *
 * One result is added straight to the library — that is the whole point of
 * pasting a DOI. Several results means the input was a title search and the
 * matches are guesses, so they are shown for the user to choose from rather
 * than picking one on their behalf.
 */

export type LookupStatus = 'idle' | 'searching' | 'choosing' | 'error';

export interface LookupState {
  status: LookupStatus;
  /** Candidates, when the input was ambiguous enough to need a choice. */
  candidates: LookupResult[];
  /** What was searched, kept for provenance when a candidate is picked. */
  query: string;
  error: string | null;
  /** Set when the lookup succeeded but found nothing citable. */
  message: string | null;
}

const IDLE: LookupState = {
  status: 'idle',
  candidates: [],
  query: '',
  error: null,
  message: null,
};

export function useLookup() {
  const actions = useLibraryActions();
  const [state, setState] = useState<LookupState>(IDLE);

  /** Aborts an in-flight lookup when a new one starts. */
  const inFlight = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setState(IDLE);
  }, []);

  const accept = useCallback(
    async (result: LookupResult, query: string) => {
      const id = await actions.addCitation(cslForStorage(result), {
        source: sourceFor(query, result),
      });
      setState(IDLE);
      return id;
    },
    [actions],
  );

  const search = useCallback(
    async (rawQuery: string, manualType: CSLItemType = 'document') => {
      const query = rawQuery.trim();
      if (!query) return;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setState({ ...IDLE, status: 'searching', query });

      try {
        const response = await lookupMetadata(query, { signal: controller.signal });
        if (controller.signal.aborted) return;

        if (response.results.length === 0) {
          setState({
            ...IDLE,
            status: 'error',
            query,
            message: response.message ?? 'Nothing was found for that.',
          });
          return;
        }

        // An identifier resolves to exactly one record — add it and be done.
        if (response.results.length === 1) {
          await accept(response.results[0]!, query);
          return;
        }

        setState({ ...IDLE, status: 'choosing', candidates: response.results, query });
      } catch (error) {
        if (controller.signal.aborted || (error as Error).name === 'AbortError') return;

        // A web page needs a server to read it. Rather than report a failure,
        // open manual entry with the address and today's date already filled
        // in — which is most of the work of citing a page anyway.
        if (error instanceof UrlLookupUnavailable) {
          setState(IDLE);
          actions.openDialog({
            kind: 'manual-entry',
            prefill: { type: manualType === 'document' ? 'webpage' : manualType, URL: error.url },
          });
          return;
        }

        setState({
          ...IDLE,
          status: 'error',
          query,
          error:
            error instanceof LookupError
              ? error.message
              : 'The lookup failed. Please try again.',
        });
      }
    },
    [accept, actions],
  );

  return { state, search, accept, reset };
}
