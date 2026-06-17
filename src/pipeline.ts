import type { IconProvider } from "./providers/types.js";
import { IconifyProvider } from "./providers/iconify.js";
import { BrandProvider } from "./providers/brand.js";
import { VendorProvider } from "./providers/vendor.js";
import { rankCandidates } from "./ranker.js";
import { expandQuery } from "./synonyms.js";
import { normalizeSvg, validateSvg } from "./svg.js";
import type { IconCandidate, IconResult, RankedIcon, SearchOptions } from "./types.js";

export interface SearchPipelineResult {
  query: string;
  terms: string[];
  /** Ranked candidates (no SVG fetched yet). */
  ranked: RankedIcon[];
}

/**
 * Orchestrates the search: expand -> fan out across providers -> rank.
 * SVG fetching is a separate, lazy step (`resolveSvgs`) so callers that only
 * want to list matches don't pay for downloads they won't use.
 */
export class IconSearch {
  private readonly providers: IconProvider[];
  private readonly byName: Map<string, IconProvider>;

  constructor(
    providers: IconProvider[] = [new IconifyProvider(), new BrandProvider(), new VendorProvider()],
  ) {
    this.providers = providers;
    this.byName = new Map(providers.map((p) => [p.name, p]));
  }

  async search(query: string, options: SearchOptions): Promise<SearchPipelineResult> {
    const terms = options.noExpand ? [query.trim().toLowerCase()] : expandQuery(query);

    const settled = await Promise.allSettled(
      this.providers.map((p) => p.search(terms, options)),
    );

    const candidates: IconCandidate[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") candidates.push(...r.value);
    }

    const ranked = rankCandidates(candidates, terms, options);
    return { query, terms, ranked };
  }

  /**
   * Fetch and validate SVGs for the given candidates, in rank order.
   * Invalid/failed SVGs are skipped (with a console warning) so the caller
   * still gets the best *usable* icons. Stops once `count` valid SVGs land.
   */
  async resolveSvgs(candidates: RankedIcon[], count: number): Promise<IconResult[]> {
    const results: IconResult[] = [];

    for (const candidate of candidates) {
      if (results.length >= count) break;
      const provider = this.byName.get(candidate.source);
      if (!provider) continue;

      const raw = await provider.fetchSvg(candidate);
      if (!raw) continue;

      const svg = normalizeSvg(raw);
      const check = validateSvg(svg);
      if (!check.valid) {
        console.warn(`skip ${candidate.id}: invalid SVG (${check.reason})`);
        continue;
      }
      results.push({ ...candidate, svg });
    }

    return results;
  }

  /** Convenience: search + resolve the single best valid SVG. */
  async best(query: string, options: SearchOptions): Promise<IconResult | null> {
    const { ranked } = await this.search(query, options);
    const [result] = await this.resolveSvgs(ranked, 1);
    return result ?? null;
  }
}
