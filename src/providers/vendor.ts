import type { IconCandidate, SearchOptions } from "../types.js";
import type { IconProvider } from "./types.js";
import { bestScore } from "../match.js";
import { readCache, writeCache } from "../cache.js";

/**
 * Official cloud-vendor architecture icons (AWS / Azure / GCP) as SVG.
 *
 * Iconify's brand sets (logos, simple-icons) miss most cloud SERVICE icons
 * (EMR, SageMaker, Kinesis Firehose, Synapse, BigQuery, …). This provider
 * sources them from the community-maintained mirror of the official vendor
 * asset packages at github.com/tf2d2/icons — 2.6k+ SVGs spanning AWS, Azure
 * and GCP. The icon index is built from the repo's git tree once and cached;
 * individual SVGs are fetched lazily from raw.githubusercontent and cached by
 * the OS/browser layer above us.
 *
 * Note: these are trademarked vendor logos, licensed by AWS/Microsoft/Google
 * for use in architecture diagrams. They are not generic open-source icons.
 */

const REPO = "tf2d2/icons";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const INDEX_CACHE_KEY = "vendor-index-tf2d2";
const REQUEST_TIMEOUT_MS = 15_000;
/** AWS service icons ship in 16/32/48/64 px; keep only the largest for fidelity. */
const PREFERRED_AWS_SIZE = "64";
const PER_VENDOR_KEEP = 20;

const VENDOR_META: Record<string, { prefix: string; collection: string; license: string }> = {
  aws: { prefix: "aws", collection: "AWS Architecture Icons", license: "AWS (diagram use)" },
  azure: { prefix: "azure", collection: "Azure Architecture Icons", license: "Microsoft (diagram use)" },
  gcp: { prefix: "gcp", collection: "GCP Architecture Icons", license: "Google (diagram use)" },
};

interface VendorEntry {
  prefix: string; // aws | azure | gcp
  name: string; // display name, e.g. "Amazon EMR"
  ref: string; // raw path within the repo
}

interface GitTreeResponse {
  tree?: { path: string; type: string }[];
}

/** Filename (sans .svg) -> human-readable name. */
function displayName(file: string): string {
  return file.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim();
}

/** Parse a repo path into an index entry, or null to skip it. */
function parsePath(path: string): VendorEntry | null {
  if (!path.toLowerCase().endsWith(".svg")) return null;
  const parts = path.split("/");
  const vendor = parts[0];
  const meta = VENDOR_META[vendor];
  if (!meta) return null;

  if (vendor === "aws") {
    const tier = parts[1]; // category | resource | service
    // category/service paths carry a size segment; keep only the largest.
    if (tier === "service" || tier === "category") {
      const hasSize = parts.some((p) => /^\d+$/.test(p));
      if (hasSize && !parts.includes(PREFERRED_AWS_SIZE)) return null;
    }
  }

  return { prefix: meta.prefix, name: displayName(parts[parts.length - 1]), ref: path };
}

export class VendorProvider implements IconProvider {
  readonly name = "vendor";
  private index: VendorEntry[] | null = null;

  private async loadIndex(): Promise<VendorEntry[]> {
    if (this.index) return this.index;

    const cached = await readCache<VendorEntry[]>(INDEX_CACHE_KEY);
    if (cached) return (this.index = cached);

    const resp = await this.getJson<GitTreeResponse>(TREE_URL);
    const entries: VendorEntry[] = [];
    const seen = new Set<string>();
    for (const node of resp?.tree ?? []) {
      if (node.type !== "blob") continue;
      const entry = parsePath(node.path);
      if (!entry) continue;
      const id = `${entry.prefix}:${entry.name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push(entry);
    }
    if (entries.length) await writeCache(INDEX_CACHE_KEY, entries);
    return (this.index = entries);
  }

  async search(terms: string[], _options: SearchOptions): Promise<IconCandidate[]> {
    const index = await this.loadIndex();
    if (!index.length) return [];

    // Score every entry, then keep the best PER_VENDOR_KEEP per cloud so a
    // single vendor's deep catalog can't crowd out the others.
    const perVendor = new Map<string, { entry: VendorEntry; score: number }[]>();
    for (const entry of index) {
      const score = bestScore(entry.name, terms);
      if (score <= 0) continue;
      const bucket = perVendor.get(entry.prefix) ?? [];
      bucket.push({ entry, score });
      perVendor.set(entry.prefix, bucket);
    }

    const candidates: IconCandidate[] = [];
    for (const [prefix, bucket] of perVendor) {
      bucket.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length);
      const meta = Object.values(VENDOR_META).find((m) => m.prefix === prefix)!;
      bucket.slice(0, PER_VENDOR_KEEP).forEach(({ entry, score }, rank) => {
        candidates.push({
          id: `${prefix}:${entry.name}`,
          prefix,
          name: entry.name,
          ref: entry.ref,
          source: this.name,
          providerRank: rank,
          priorScore: score,
          collection: meta.collection,
          license: meta.license,
        });
      });
    }
    return candidates;
  }

  async fetchSvg(candidate: IconCandidate): Promise<string | null> {
    if (!candidate.ref) return null;
    try {
      const res = await fetch(`${RAW_BASE}/${candidate.ref.split("/").map(encodeURIComponent).join("/")}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text.includes("<svg") ? text : null;
    } catch {
      return null;
    }
  }

  private async getJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "application/vnd.github+json", "User-Agent": "icon-search" },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }
}
