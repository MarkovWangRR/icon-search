import type { RankedIcon } from "./types.js";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

/** Pretty list of ranked matches for the terminal. */
export function printRanked(ranked: RankedIcon[], terms: string[]): void {
  if (ranked.length === 0) {
    console.log(c.yellow("No matching icons found."));
    return;
  }
  console.log(c.dim(`search terms: ${terms.join(", ")}`));
  console.log(c.dim(`${ranked.length} match(es)\n`));

  const idWidth = Math.min(40, Math.max(...ranked.map((r) => r.id.length)));
  ranked.forEach((r, i) => {
    const rank = c.dim(String(i + 1).padStart(2) + ".");
    const id = c.cyan(r.id.padEnd(idWidth));
    const meta = [r.collection, r.license].filter(Boolean).join(" · ");
    const score = c.dim(`score ${r.score.toFixed(0)}`);
    console.log(`${rank} ${id}  ${score}  ${c.dim(meta)}`);
  });
}

/** JSON output for piping into other tools. */
export function asJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
