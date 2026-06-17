/** Shared domain types for the icon search pipeline. */

/** A single icon candidate surfaced by a provider, before SVG is fetched. */
export interface IconCandidate {
  /** Unique id, e.g. "mdi:home". Globally unique across providers. */
  id: string;
  /** Icon set / collection prefix, e.g. "mdi". */
  prefix: string;
  /** Icon name within its set, e.g. "home". */
  name: string;
  /** Human-readable collection name, e.g. "Material Design Icons". */
  collection?: string;
  /** SPDX license id of the collection, when known, e.g. "MIT". */
  license?: string;
  /** Which provider produced this candidate, e.g. "iconify". */
  source: string;
  /** Provider-internal resolution handle (e.g. a file path) for fetchSvg. */
  ref?: string;
  /** Provider-assigned rank (0 = most relevant), used as a tiebreaker. */
  providerRank: number;
  /**
   * Optional provider confidence (higher = better match). Providers that do
   * their own strong matching (e.g. the brand/logo provider) set this so the
   * global ranker can trust their signal. Roughly 0–1000.
   */
  priorScore?: number;
  /** Free-form tags / keywords associated with the icon or its set. */
  tags?: string[];
}

/** A scored candidate after ranking. */
export interface RankedIcon extends IconCandidate {
  score: number;
}

/** A fully resolved result with its SVG markup. */
export interface IconResult extends RankedIcon {
  svg: string;
}

/** Options shared across the search pipeline. */
export interface SearchOptions {
  /** How many ranked candidates to keep. */
  limit: number;
  /** Restrict to these icon-set prefixes (e.g. ["mdi", "tabler"]). */
  prefixes?: string[];
  /** Restrict to these SPDX license ids. */
  licenses?: string[];
  /** Preferred style hint, e.g. "outline" | "fill" | "duotone". */
  style?: string;
  /** Disable synonym expansion. */
  noExpand?: boolean;
}
