/**
 * Lookup failures, in one place so both the service and the direct paths can
 * throw the same types without importing each other.
 */
export class LookupError extends Error {
  constructor(
    message: string,
    readonly code: string = 'internal',
  ) {
    super(message);
    this.name = 'LookupError';
  }
}

/** Nothing could be reached — as distinct from nothing being found. */
export class LookupOffline extends LookupError {
  constructor() {
    super(
      'Could not reach the citation databases. Check your connection — everything already in your library still works offline.',
      'offline',
    );
    this.name = 'LookupOffline';
  }
}

/**
 * Reading a web page needs a server. Carries the address so the caller can
 * offer manual entry with it already filled in.
 */
export class UrlLookupUnavailable extends LookupError {
  constructor(readonly url: string) {
    super('Citing a web page needs the lookup service.', 'url-unsupported');
    this.name = 'UrlLookupUnavailable';
  }
}
