#!/usr/bin/env node
import { parseArgs } from "node:util";
import { IconSearch } from "./pipeline.js";
import { asJson, printRanked } from "./output.js";
import { recolor, usesCurrentColor, type RecolorMode } from "./color.js";
import { generateIcon } from "./generate/index.js";
import type { IconResult, SearchOptions } from "./types.js";

const USAGE = `
icon-search — stateless icon search: keyword in, best-matching SVG out.

Nothing is ever written to disk. Results are printed to stdout; redirect them
yourself if you want to keep one (e.g. \`> cart.svg\`).

Usage:
  icon-search <keyword...> [options]

Options:
  -n, --limit <n>      Number of matches to list / resolve (default: 10)
  -b, --best           Print the single best-matching SVG to stdout
      --svg            Print the SVG markup of the top matches to stdout
  -c, --color <c>      Recolor the SVG output (any CSS color, e.g. '#ff0066', red).
                       Default: recolors monochrome (currentColor) icons only.
      --flatten        With --color, collapse ALL colors (incl. brand logos &
                       gradients) to one flat color.
      --gradient       With --color, re-hue every color INCLUDING gradients to the
                       chosen primary color while keeping the original shading/depth.
      --set <p>        Restrict to icon set prefix(es), comma-separated (e.g. mdi,tabler,aws)
      --license <l>    Restrict to SPDX license(s), comma-separated (e.g. MIT,Apache-2.0)
      --style <s>      Prefer a style: outline | fill | duotone | round | ...
      --no-expand      Disable synonym expansion (exact terms only)
      --json           Output machine-readable JSON
  -h, --help           Show this help

Generation (multimodal LLM, square-constrained SVG; needs API env vars):
  -g, --generate       Generate a square SVG icon for the query instead of searching
      --gen-provider   minimax | anthropic | openai (default: autodetect from env)
      --gen-model <m>  Override the model id
      --gen-retries <n> Max generate→validate→repair attempts (default: 3)

Examples:
  icon-search redshift                 # list matches (no SVG fetched)
  icon-search "shopping cart" --best   # print the best SVG to stdout
  icon-search redshift --best > rs.svg # you choose to save it
  icon-search emr --json --svg         # JSON incl. SVG markup, top results
  icon-search athena --set aws         # restrict to official AWS icons
  icon-search "a fox riding a rocket" --generate   # LLM-generated square SVG
`;

function splitList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  const items = v.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: "string", short: "n" },
      best: { type: "boolean", short: "b" },
      svg: { type: "boolean" },
      color: { type: "string", short: "c" },
      flatten: { type: "boolean" },
      gradient: { type: "boolean" },
      set: { type: "string" },
      license: { type: "string" },
      style: { type: "string" },
      "no-expand": { type: "boolean" },
      json: { type: "boolean" },
      generate: { type: "boolean", short: "g" },
      "gen-provider": { type: "string" },
      "gen-model": { type: "string" },
      "gen-retries": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(USAGE.trim());
    return values.help ? 0 : 1;
  }

  const query = positionals.join(" ");
  const limit = values.limit ? Math.max(1, parseInt(values.limit, 10) || 10) : 10;

  const options: SearchOptions = {
    limit,
    prefixes: splitList(values.set),
    licenses: splitList(values.license),
    style: values.style,
    noExpand: values["no-expand"],
  };

  const engine = new IconSearch();

  // Recolor transform applied to any SVG before it leaves the process.
  const mode: RecolorMode = values.gradient ? "retint" : values.flatten ? "flatten" : "theme";
  let warnedMulticolor = false;
  const paint = (r: IconResult): IconResult => {
    if (!values.color) return r;
    if (mode === "theme" && !usesCurrentColor(r.svg) && !warnedMulticolor) {
      console.error(
        `note: ${r.id} is a multi-color icon — plain --color left its colors intact. ` +
          `Use --gradient (re-hue, keep shading) or --flatten (single flat color).`,
      );
      warnedMulticolor = true;
    }
    return { ...r, svg: recolor(r.svg, { color: values.color!, mode }) };
  };

  // --generate: synthesize a square SVG via a multimodal LLM (agent loop).
  if (values.generate) {
    const provider = values["gen-provider"] as "minimax" | "anthropic" | "openai" | undefined;
    const result = await generateIcon(query, {
      provider,
      model: values["gen-model"],
      maxAttempts: values["gen-retries"] ? parseInt(values["gen-retries"], 10) || 3 : 3,
      style: values.style,
      // Generate monochrome (currentColor) by default so --color can recolor it.
      color: false,
    });
    if ("error" in result) {
      console.error("generate failed:", result.error);
      return 2;
    }
    let svg = result.svg;
    if (values.color) svg = recolor(svg, { color: values.color, mode });
    console.error(`generated via ${result.backend} in ${result.attempts} attempt(s)`);
    if (values.json) console.log(asJson({ query, generated: true, backend: result.backend, svg }));
    else process.stdout.write(svg.endsWith("\n") ? svg : svg + "\n");
    return 0;
  }

  // --best: emit just the winning SVG to stdout (pipe-friendly).
  if (values.best) {
    const result = await engine.best(query, options);
    if (!result) {
      console.error("No usable icon found for:", query);
      return 2;
    }
    const painted = paint(result);
    if (values.json) console.log(asJson(painted));
    else process.stdout.write(painted.svg.endsWith("\n") ? painted.svg : painted.svg + "\n");
    return 0;
  }

  const { terms, ranked } = await engine.search(query, options);

  // --svg: resolve and emit the top matches' SVG markup to stdout (never saved).
  if (values.svg) {
    const results = await engine.resolveSvgs(ranked, limit);
    if (values.json) {
      console.log(asJson({ query, terms, results }));
    } else {
      for (const r of results) {
        process.stdout.write(`<!-- ${r.id} -->\n${r.svg}\n\n`);
      }
    }
    return results.length ? 0 : 2;
  }

  // Default: list ranked matches (ids + metadata). No SVG fetched, no files.
  if (values.json) {
    console.log(asJson({ query, terms, ranked }));
  } else {
    printRanked(ranked, terms);
  }
  return ranked.length ? 0 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("icon-search failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
