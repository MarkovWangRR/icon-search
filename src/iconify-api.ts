import { readCache, writeCache } from "./cache.js";

/** Shared, low-level access to the Iconify API used by all providers. */

const API_BASE = "https://api.iconify.design";
const REQUEST_TIMEOUT_MS = 12_000;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface IconifyCollectionMeta {
  name?: string;
  license?: { spdx?: string; title?: string };
  category?: string;
  tags?: string[];
}

export interface IconifySearchResponse {
  icons?: string[];
  collections?: Record<string, IconifyCollectionMeta>;
}

/** Full-text search across all sets. Weak recall for product names by design. */
export function searchIcons(term: string, limit: number): Promise<IconifySearchResponse | null> {
  return getJson<IconifySearchResponse>(`${API_BASE}/search?query=${encodeURIComponent(term)}&limit=${limit}`);
}

interface CollectionResponse {
  title?: string;
  uncategorized?: string[];
  categories?: Record<string, string[]>;
  aliases?: Record<string, string>;
}

export interface CollectionInventory {
  prefix: string;
  title?: string;
  /** Every icon name in the set, including alias names. */
  names: string[];
}

/**
 * Fetch the complete icon-name inventory of a set, cached on disk. This is the
 * key to good product/brand recall: we match locally against the full listing
 * instead of relying on Iconify's full-text search.
 */
export async function fetchCollectionInventory(prefix: string): Promise<CollectionInventory | null> {
  const cacheKey = `collection-${prefix}`;
  const cached = await readCache<CollectionInventory>(cacheKey);
  if (cached) return cached;

  const resp = await getJson<CollectionResponse>(`${API_BASE}/collection?prefix=${encodeURIComponent(prefix)}`);
  if (!resp) return null;

  const names = new Set<string>(resp.uncategorized ?? []);
  for (const group of Object.values(resp.categories ?? {})) {
    for (const n of group) names.add(n);
  }
  for (const alias of Object.keys(resp.aliases ?? {})) names.add(alias);

  const inventory: CollectionInventory = { prefix, title: resp.title, names: [...names] };
  await writeCache(cacheKey, inventory);
  return inventory;
}

/** Fetch raw SVG markup for an icon id. */
export async function fetchSvgMarkup(prefix: string, name: string): Promise<string | null> {
  const url = `${API_BASE}/${prefix}/${encodeURIComponent(name)}.svg`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes("<svg") ? text : null;
  } catch {
    return null;
  }
}
