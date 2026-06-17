/**
 * Lightweight query expansion. Icon sets name things inconsistently
 * ("trash" vs "delete" vs "bin", "cog" vs "settings"), so we widen the
 * query with a few high-value synonyms to improve recall. This is a curated
 * table on purpose: it is predictable and costs nothing at runtime. A future
 * version can swap this for an embedding model behind the same function.
 */
const SYNONYMS: Record<string, string[]> = {
  delete: ["trash", "bin", "remove"],
  trash: ["delete", "bin", "remove"],
  remove: ["delete", "trash", "minus"],
  settings: ["cog", "gear", "preferences"],
  cog: ["settings", "gear"],
  gear: ["settings", "cog"],
  user: ["account", "person", "profile"],
  account: ["user", "person", "profile"],
  person: ["user", "account", "profile"],
  search: ["magnify", "find", "magnifier"],
  magnify: ["search", "magnifier"],
  home: ["house"],
  house: ["home"],
  edit: ["pencil", "pen", "modify"],
  pencil: ["edit", "pen"],
  email: ["mail", "envelope"],
  mail: ["email", "envelope"],
  photo: ["image", "picture", "camera"],
  image: ["photo", "picture"],
  picture: ["photo", "image"],
  download: ["save", "arrow-down", "import"],
  upload: ["arrow-up", "export"],
  warning: ["alert", "caution", "exclamation"],
  alert: ["warning", "bell", "notification"],
  notification: ["bell", "alert"],
  bell: ["notification", "alert"],
  close: ["x", "cross", "cancel"],
  cancel: ["close", "x", "cross"],
  add: ["plus", "new", "create"],
  plus: ["add", "new"],
  star: ["favorite", "bookmark"],
  favorite: ["star", "heart", "bookmark"],
  heart: ["like", "favorite", "love"],
  like: ["heart", "thumb-up"],
  calendar: ["date", "schedule", "event"],
  cart: ["basket", "shopping", "bag"],
  lock: ["secure", "password", "private"],
  link: ["url", "chain", "hyperlink"],
  menu: ["hamburger", "list", "bars"],
  refresh: ["reload", "sync", "rotate"],
  check: ["tick", "done", "ok", "success"],
  info: ["information", "help"],
  phone: ["call", "telephone", "mobile"],
  location: ["pin", "map", "place", "marker"],

  // IT-infrastructure aliases — only unambiguous shorthand -> canonical slug
  // mappings. Ambiguous expansions (db -> database, ci -> jenkins) are
  // deliberately omitted: they pull generic category icons into product
  // queries (e.g. "cosmos db" matching a generic "Database" icon).
  k8s: ["kubernetes"],
  k8: ["kubernetes"],
  postgres: ["postgresql"],
  pg: ["postgresql"],
  node: ["nodejs"],
  golang: ["go"],
};

/**
 * Expand a raw user query into a deduped list of search terms.
 * The original (normalised) query is always first so it ranks highest.
 */
export function expandQuery(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const terms: string[] = [];
  const seen = new Set<string>();

  const push = (t: string) => {
    const v = t.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      terms.push(v);
    }
  };

  push(normalized);

  // Expand the whole phrase and each individual word.
  const words = normalized.split(/\s+/).filter(Boolean);
  const sources = words.length > 1 ? [normalized, ...words] : [normalized];
  for (const src of sources) {
    for (const syn of SYNONYMS[src] ?? []) push(syn);
  }

  return terms;
}
