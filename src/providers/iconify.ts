import type { IconCandidate, SearchOptions } from "../types.js";
import type { IconProvider } from "./types.js";
import { fetchSvgMarkup, searchIcons } from "../iconify-api.js";

/** Iconify caps `limit` at 999; we ask for a deep pool and rank locally. */
const SEARCH_LIMIT = 120;

/**
 * Provider backed by the Iconify full-text search endpoint. Good for generic
 * UI icons ("home", "settings"); brand/product recall is handled separately by
 * the BrandProvider, which both run together in the pipeline.
 */
export class IconifyProvider implements IconProvider {
  readonly name = "iconify";

  async search(terms: string[], _options: SearchOptions): Promise<IconCandidate[]> {
    const responses = await Promise.all(terms.map((term) => searchIcons(term, SEARCH_LIMIT)));
    const byId = new Map<string, IconCandidate>();

    responses.forEach((resp, termIndex) => {
      if (!resp?.icons) return;
      const collections = resp.collections ?? {};

      resp.icons.forEach((id, rankInResponse) => {
        const sep = id.indexOf(":");
        if (sep <= 0) return;
        const prefix = id.slice(0, sep);
        const name = id.slice(sep + 1);

        // Synonym terms (termIndex > 0) get a worse base rank so the primary
        // query's ordering dominates.
        const providerRank = termIndex * SEARCH_LIMIT + rankInResponse;

        const existing = byId.get(id);
        if (existing) {
          if (providerRank < existing.providerRank) existing.providerRank = providerRank;
          return;
        }

        const meta = collections[prefix];
        byId.set(id, {
          id,
          prefix,
          name,
          source: this.name,
          providerRank,
          collection: meta?.name,
          license: meta?.license?.spdx,
          tags: meta?.tags,
        });
      });
    });

    return [...byId.values()];
  }

  fetchSvg(candidate: IconCandidate): Promise<string | null> {
    return fetchSvgMarkup(candidate.prefix, candidate.name);
  }
}
