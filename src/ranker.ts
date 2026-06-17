import type { IconCandidate, RankedIcon, SearchOptions } from "./types.js";

/**
 * Popularity-ish priors. Iconify already returns roughly relevance-ordered
 * results, but boosting a few well-maintained, broadly-recognised sets nudges
 * ambiguous queries toward icons users are more likely to want.
 */
const SET_BOOST: Record<string, number> = {
  mdi: 6,
  "material-symbols": 6,
  tabler: 5,
  ri: 5,
  ph: 4,
  lucide: 6,
  solar: 4,
  ic: 4,
  bi: 3,
  carbon: 3,
  // Brand / product / infra sets — preferred for IT-infrastructure queries.
  logos: 8,
  devicon: 5,
  "simple-icons": 4,
  "skill-icons": 3,
  cib: 2,
  // Official cloud-vendor architecture icons — authoritative for cloud
  // services, so they edge out generic brand logos for AWS/Azure/GCP queries.
  aws: 9,
  azure: 9,
  gcp: 9,
};

const STYLE_KEYWORDS = ["outline", "fill", "filled", "line", "bold", "duotone", "round", "sharp", "thin", "light", "twotone"];

/** Colored brand-logo sets — preferred for brand/product names (docker, redis). */
const BRAND_LOGO_SETS = new Set(["logos", "devicon", "simple-icons", "skill-icons", "cib"]);
/** Official cloud-vendor architecture sets — carry some generic-named noise. */
const VENDOR_ARCH_SETS = new Set(["aws", "azure", "gcp"]);

/**
 * Bonus added to a literal whole-name match, by set tier. Resolves which set
 * wins when the same name exists in several: a colored brand logo beats a
 * monochrome UI glyph for "docker"; a generic UI glyph beats a vendor-arch
 * icon that merely happens to be named "home".
 */
function exactMatchBonus(prefix: string): number {
  if (BRAND_LOGO_SETS.has(prefix)) return 80;
  if (VENDOR_ARCH_SETS.has(prefix)) return 0;
  return 60; // generic UI sets
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s\-_:]+/).filter(Boolean);
}

/**
 * Score a single candidate against the (already expanded) query terms.
 * Higher is better. The scale is arbitrary but internally consistent.
 */
function scoreCandidate(c: IconCandidate, terms: string[], options: SearchOptions): number {
  const primary = terms[0] ?? "";
  const nameTokens = tokenize(c.name);
  const nameStr = c.name.toLowerCase();
  const haystack = [c.name, ...(c.tags ?? [])].join(" ").toLowerCase();

  let score = 0;
  const exact = nameStr === primary;

  // A literal whole-name match is the strongest signal of all — strong enough
  // that a generic word ("home") is never hijacked by a brand whose slug merely
  // contains it after vendor-prefix stripping ("google-home").
  if (exact) {
    score += 250 + exactMatchBonus(c.prefix);
  }
  // Name equals an expanded synonym — a weaker signal than a primary-term
  // match, so it can't let a generic icon outrank a near-exact product match.
  else if (terms.includes(nameStr)) score += 40;

  for (const term of terms) {
    const isPrimary = term === primary;
    const weight = isPrimary ? 1 : 0.5;

    if (nameTokens.includes(term)) score += 30 * weight; // whole-word hit
    else if (nameStr.includes(term)) score += 12 * weight; // substring hit
    else if (haystack.includes(term)) score += 6 * weight; // tag/keyword hit
  }

  // Shorter names tend to be the canonical service ("Amazon MSK" beats
  // "Amazon MSK Connect"; "home" beats "home-variant"). A continuous penalty
  // pushes base services above their sub-variants.
  score -= nameTokens.length * 2.5;

  // Well-known set prior.
  score += SET_BOOST[c.prefix] ?? 0;

  // Trust a provider that did its own strong matching (Brand/Vendor) — but only
  // for non-literal matches. A literal exact match is already maximal, so a
  // vendor icon coincidentally named like a generic word ("home") shouldn't get
  // an extra priorScore boost that lets it beat the canonical UI icon.
  if (c.priorScore && !exact) score += c.priorScore * 0.13;

  // Style preference: reward the requested style, lightly penalise mismatches.
  if (options.style) {
    const wanted = options.style.toLowerCase();
    if (haystack.includes(wanted)) score += 15;
    else if (STYLE_KEYWORDS.some((s) => s !== wanted && nameTokens.includes(s))) score -= 2;
  }

  // Provider rank as a gentle tiebreaker (earlier = better).
  score -= c.providerRank * 0.1;

  return score;
}

/** Filter, score, sort and truncate candidates. */
export function rankCandidates(
  candidates: IconCandidate[],
  terms: string[],
  options: SearchOptions,
): RankedIcon[] {
  let pool = candidates;

  if (options.prefixes?.length) {
    const set = new Set(options.prefixes);
    pool = pool.filter((c) => set.has(c.prefix));
  }
  if (options.licenses?.length) {
    const set = new Set(options.licenses.map((l) => l.toLowerCase()));
    pool = pool.filter((c) => c.license && set.has(c.license.toLowerCase()));
  }

  // The same icon id can surface from multiple providers; keep the richest
  // copy (one that carries a priorScore / lower rank).
  const byId = new Map<string, IconCandidate>();
  for (const c of pool) {
    const prev = byId.get(c.id);
    if (!prev) {
      byId.set(c.id, c);
    } else {
      byId.set(c.id, {
        ...prev,
        priorScore: Math.max(prev.priorScore ?? 0, c.priorScore ?? 0),
        providerRank: Math.min(prev.providerRank, c.providerRank),
      });
    }
  }

  return [...byId.values()]
    .map((c) => ({ ...c, score: scoreCandidate(c, terms, options) }))
    .sort((a, b) => b.score - a.score || a.providerRank - b.providerRank)
    .slice(0, options.limit);
}
