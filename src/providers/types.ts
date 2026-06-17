import type { IconCandidate, SearchOptions } from "../types.js";

/**
 * A source of icon candidates. The Iconify provider is the primary one today;
 * future providers (e.g. an internet image -> SVG vectorizer) implement the
 * same contract so the pipeline never has to special-case them.
 */
export interface IconProvider {
  /** Stable identifier, written into `IconCandidate.source`. */
  readonly name: string;

  /**
   * Find candidates for the given query terms. `terms` is already expanded
   * (original keyword + synonyms). Implementations should be resilient: on
   * failure, prefer returning [] over throwing, so one dead source does not
   * sink the whole search.
   */
  search(terms: string[], options: SearchOptions): Promise<IconCandidate[]>;

  /**
   * Resolve the SVG markup for a candidate this provider produced.
   * Returns null if the SVG cannot be fetched.
   */
  fetchSvg(candidate: IconCandidate): Promise<string | null>;
}
