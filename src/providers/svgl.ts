import type { IconCandidate, SearchOptions } from "../types.js";
import type { IconProvider } from "./types.js";
import { bestScore } from "../match.js";
import { readCache, writeCache } from "../cache.js";

/**
 * Brand / company logo provider backed by SVGL (https://svgl.app), a curated,
 * frequently-updated catalog of ~660 product logos. It complements Iconify's
 * `logos` set, which lags on newer companies/products. Free, no API key.
 *
 * We fetch the whole catalog once (it's tiny), hold it in memory, and match
 * locally with the shared matcher — consistent with the other providers and
 * resilient to SVGL's substring-only search endpoint.
 */

const CATALOG_URL = "https://api.svgl.app";
const CACHE_KEY = "svgl-catalog";
const REQUEST_TIMEOUT_MS = 12_000;
const PER_QUERY_KEEP = 15;

interface SvglRoute {
  light?: string;
  dark?: string;
}
interface SvglItem {
  title: string;
  route?: string | SvglRoute;
  wordmark?: string | SvglRoute;
}

interface CatalogEntry {
  title: string;
  /** Resolved URL of the default (icon, light) SVG. */
  url: string;
}

/** Pick the default icon SVG URL: prefer the plain/light icon over wordmarks. */
function iconUrl(item: SvglItem): string | null {
  const r = item.route;
  if (typeof r === "string") return r;
  if (r && (r.light || r.dark)) return r.light ?? r.dark ?? null;
  return null;
}

export class SvglProvider implements IconProvider {
  readonly name = "svgl";
  private catalog: CatalogEntry[] | null = null;

  private async loadCatalog(): Promise<CatalogEntry[]> {
    if (this.catalog) return this.catalog;
    const cached = await readCache<CatalogEntry[]>(CACHE_KEY);
    if (cached) return (this.catalog = cached);

    try {
      const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return (this.catalog = []);
      const items = (await res.json()) as SvglItem[];
      const entries: CatalogEntry[] = [];
      for (const item of items) {
        const url = iconUrl(item);
        if (item?.title && url) entries.push({ title: item.title, url });
      }
      if (entries.length) await writeCache(CACHE_KEY, entries);
      return (this.catalog = entries);
    } catch {
      return (this.catalog = []);
    }
  }

  async search(terms: string[], _options: SearchOptions): Promise<IconCandidate[]> {
    const catalog = await this.loadCatalog();
    const scored: { entry: CatalogEntry; score: number }[] = [];
    for (const entry of catalog) {
      const score = bestScore(entry.title, terms);
      if (score > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length);

    return scored.slice(0, PER_QUERY_KEEP).map(({ entry, score }, rank) => ({
      id: `svgl:${entry.title}`,
      prefix: "svgl",
      name: entry.title,
      ref: entry.url,
      source: this.name,
      providerRank: rank,
      priorScore: score,
      collection: "SVGL",
      license: "Brand (trademark)",
    }));
  }

  async fetchSvg(candidate: IconCandidate): Promise<string | null> {
    if (!candidate.ref) return null;
    try {
      const res = await fetch(candidate.ref, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return null;
      const text = await res.text();
      return text.includes("<svg") ? text : null;
    } catch {
      return null;
    }
  }
}
