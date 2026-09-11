/**
 * How a resolver reaches the network.
 *
 * The resolvers themselves are pure mapping plus a URL, and they run in two
 * very different places: a serverless function, which should identify itself
 * with a user agent and impose a timeout, and the browser, which cannot set a
 * user agent at all. Injecting the fetch keeps one implementation of the
 * mapping — the part that is easy to get subtly wrong — instead of two that
 * drift.
 *
 * Returning `undefined` rather than throwing is deliberate: for a lookup,
 * "no record" and "request failed" lead to the same next step, which is to try
 * the next resolver.
 */
export type JSONFetcher = <T>(url: string) => Promise<T | undefined>;

/** Options a resolver may need that differ between environments. */
export interface ResolverOptions {
  /** Google Books quota key. Absent in the browser, optional on the server. */
  googleBooksApiKey?: string;
}
