/**
 * Shared fuzzy matching for product / brand / vendor icon names.
 *
 * The core problem: icons are named with vendor prefixes ("aws-redshift",
 * "Amazon-EMR", "Azure-Synapse-Analytics") or concatenated slugs
 * ("apachekafka"), so a bare product query ("redshift", "emr", "kafka") won't
 * match naively. We compare on a normalised "compact" form and also on a form
 * with leading vendor/umbrella prefixes stripped.
 */

/** Leading slug fragments stripped before matching, longest first. */
const VENDOR_PREFIXES = [
  "amazonwebservices",
  "googlecloudplatform",
  "googlecloud",
  "microsoftazure",
  "alibabacloud",
  "oraclecloud",
  "tencentcloud",
  "elasticcloud",
  "amazonaws",
  "amazon",
  "azure",
  "google",
  "alibaba",
  "oracle",
  "apache",
  "microsoft",
  "tencent",
  "huawei",
  "aws",
  "gcp",
  "ibm",
].sort((a, b) => b.length - a.length);

/** Suffixes that mark a less-preferred variant (wordmark / plain / coloured). */
const VARIANT_SUFFIXES = ["wordmark", "plain", "original", "line", "icon"];

export function compact(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, "");
}

export function tokens(s: string): string[] {
  return s.toLowerCase().split(/[\s\-_]+/).filter(Boolean);
}

/** Crude singularisation so "hub" matches "Hubs", "function" matches "Functions". */
function depluralize(t: string): string {
  return t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
}

export function stripVendor(compactName: string): string {
  for (const p of VENDOR_PREFIXES) {
    if (compactName.startsWith(p) && compactName.length > p.length) {
      return compactName.slice(p.length);
    }
  }
  return compactName;
}

/**
 * Score how well an icon `name` matches a single search `term`.
 * 0 = no match; higher = better. `isPrimary` weights the original query above
 * synonym-expanded terms.
 */
export function matchScore(name: string, term: string, isPrimary: boolean): number {
  const nameCompact = compact(name);
  const nameStripped = stripVendor(nameCompact);
  const nameTokens = tokens(name);
  const termCompact = compact(term);
  const termTokens = tokens(term);
  if (!termCompact) return 0;

  const nameTokSing = nameTokens.map(depluralize);
  const termTokSing = termTokens.map(depluralize);

  let s = 0;
  if (nameCompact === termCompact) s = 1000;
  else if (nameStripped === termCompact) s = 950; // "aws-redshift" vs "redshift"
  else if (termTokSing.every((t) => nameTokSing.includes(t))) s = 760;
  else if (nameStripped.includes(termCompact) || nameCompact.includes(termCompact)) s = 560;
  else if (termTokens.every((t) => nameCompact.includes(t))) s = 400;
  else {
    const hit = termTokens.filter((t) => nameCompact.includes(t)).length;
    if (hit > 0) s = Math.round((140 * hit) / termTokens.length);
  }

  if (s > 0 && VARIANT_SUFFIXES.some((suf) => nameTokens.includes(suf))) s -= 40;
  return isPrimary ? s : Math.round(s * 0.55);
}

/** Best match score for a name across all (expanded) query terms. */
export function bestScore(name: string, terms: string[]): number {
  let best = 0;
  for (let i = 0; i < terms.length; i++) {
    const sc = matchScore(name, terms[i], i === 0);
    if (sc > best) best = sc;
  }
  return best;
}
