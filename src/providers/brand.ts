import type { IconCandidate, SearchOptions } from "../types.js";
import type { IconProvider } from "./types.js";
import { fetchCollectionInventory, fetchSvgMarkup, type CollectionInventory } from "../iconify-api.js";
import { bestScore } from "../match.js";

/**
 * Brand / product / IT-infrastructure icon provider.
 *
 * Iconify's full-text search has poor recall for product names ("s3",
 * "redshift", "blob storage") because those icons are named with vendor
 * prefixes ("aws-s3") or as concatenated slugs ("apachekafka"). Instead of
 * trusting that search, this provider downloads the COMPLETE inventory of a
 * handful of brand icon sets (cached on disk) and matches locally, with vendor
 * and umbrella prefixes stripped so bare product names resolve correctly.
 */

/** Icon sets that carry brand / product / infra logos, best-first. */
const BRAND_SETS = ["logos", "devicon", "simple-icons", "skill-icons", "cib"] as const;

const SET_META: Record<string, { name: string; license: string }> = {
  logos: { name: "SVG Logos", license: "CC0-1.0" },
  devicon: { name: "Devicon", license: "MIT" },
  "simple-icons": { name: "Simple Icons", license: "CC0-1.0" },
  "skill-icons": { name: "Skill Icons", license: "MIT" },
  cib: { name: "CoreUI Brands", license: "CC0-1.0" },
};

const PER_SET_KEEP = 25;

export class BrandProvider implements IconProvider {
  readonly name = "brand";
  private readonly sets: readonly string[];

  constructor(sets: readonly string[] = BRAND_SETS) {
    this.sets = sets;
  }

  async search(terms: string[], _options: SearchOptions): Promise<IconCandidate[]> {
    const inventories = await Promise.all(this.sets.map((p) => fetchCollectionInventory(p)));
    const candidates: IconCandidate[] = [];

    for (const inv of inventories) {
      if (!inv) continue;
      candidates.push(...this.matchSet(inv, terms));
    }
    return candidates;
  }

  private matchSet(inv: CollectionInventory, terms: string[]): IconCandidate[] {
    const scored: { name: string; score: number }[] = [];
    for (const name of inv.names) {
      const best = bestScore(name, terms);
      if (best > 0) scored.push({ name, score: best });
    }

    scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
    const meta = SET_META[inv.prefix];

    return scored.slice(0, PER_SET_KEEP).map((m, rank) => ({
      id: `${inv.prefix}:${m.name}`,
      prefix: inv.prefix,
      name: m.name,
      source: this.name,
      providerRank: rank,
      priorScore: m.score,
      collection: meta?.name ?? inv.title,
      license: meta?.license,
    }));
  }

  fetchSvg(candidate: IconCandidate): Promise<string | null> {
    return fetchSvgMarkup(candidate.prefix, candidate.name);
  }
}
