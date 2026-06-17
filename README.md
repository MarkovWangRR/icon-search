# icon-search

Keyword in → best-matching **valid SVG** icon out. A stateless CLI search engine
that aggregates 200k+ open-source icons ([Iconify](https://iconify.design)),
official AWS/Azure/GCP architecture icons, and an optional LLM generator — tuned
for **IT-infrastructure / brand retrieval** (cloud services, databases, DevOps
tools) on top of generic UI icons.

- **Stateless** — never writes to disk. Results go to **stdout**; you decide what to keep.
- **One call, best match** — three search layers run in parallel and merge into one ranked list.
- **SVG out** — every result is validated; `--best` prints raw SVG, ready to pipe or redirect.

---

## Quick start

```bash
git clone https://github.com/MarkovWangRR/icon-search.git
cd icon-search
npm install
npm run build         # compiles src/ → dist/
npm link              # puts `icon-search` on your PATH (optional but recommended)
```

Requires **Node ≥ 20** (uses built-in `fetch`). No runtime dependencies.

```bash
icon-search redshift                  # list ranked matches
icon-search redshift --best           # print the best icon's SVG to stdout
icon-search redshift --best > rs.svg  # …redirect it yourself to save
```

If you skip `npm link`, invoke it as `node dist/cli.js <args>` (or `npm run dev -- <args>` without building).

---

## Agent / automation guide

This tool is designed to be driven by scripts and agents. The contract:

**I/O contract**
- **stdout** carries the artifact only: the ranked list, the SVG markup, or JSON. Capture this.
- **stderr** carries diagnostics (e.g. `note: multi-color icon…`, `generated via … in N attempt(s)`, errors). Safe to log/ignore; never mix into the SVG.
- **Exit codes**: `0` success · `2` no usable icon found / generation failed · `1` unexpected error.

**Recommended commands for agents**

| Goal | Command | stdout |
| --- | --- | --- |
| Get one SVG for a keyword | `icon-search "<kw>" --best` | raw `<svg>…</svg>` |
| Get the best match's id only | `icon-search "<kw>" --json` then read `.ranked[0].id` | JSON |
| Get top-N candidates (ids + metadata) | `icon-search "<kw>" -n 10 --json` | JSON |
| Get top-N SVGs with metadata | `icon-search "<kw>" -n 5 --json --svg` | JSON incl. `svg` |
| Force official cloud icon | `icon-search "<kw>" --set aws\|azure\|gcp --best` | raw SVG |
| Generate when nothing fits | `icon-search "<description>" --generate` | raw SVG |

**JSON shapes** (stable keys):

```jsonc
// icon-search redshift --json
{ "query": "redshift", "terms": ["redshift"],
  "ranked": [ { "id": "aws:Amazon Redshift", "prefix": "aws", "name": "Amazon Redshift",
               "source": "vendor", "collection": "AWS Architecture Icons",
               "license": "AWS (diagram use)", "score": 158 } ] }

// icon-search redshift --json --svg   → adds resolved markup, key becomes "results"
{ "query": "redshift", "terms": ["redshift"],
  "results": [ { "id": "aws:Amazon Redshift", "svg": "<svg …>…</svg>", "score": 158 } ] }

// icon-search "…" --generate --json
{ "query": "…", "generated": true, "backend": "anthropic (MiniMax-M3)", "svg": "<svg …>…</svg>" }
```

**Determinism note**: search is deterministic; `--generate` calls an LLM and is **not** reproducible (same prompt → different SVG). Capture generated output immediately.

---

## Options

```
icon-search <keyword...> [options]
```

| Option | Description |
| --- | --- |
| `-n, --limit <n>` | Number of matches to list / resolve (default 10) |
| `-b, --best` | Print the single best-matching SVG to stdout |
| `--svg` | Print the SVG markup of the top matches to stdout |
| `-c, --color <c>` | Recolor the output (any CSS color, e.g. `#ff0066`, `red`) |
| `--flatten` | With `--color`: collapse all colors (incl. logos/gradients) to one flat color |
| `--gradient` | With `--color`: re-hue every color incl. gradients to the new primary, keeping the shading |
| `--set <p>` | Restrict to icon-set prefix(es), comma-separated (`mdi,tabler,aws`) |
| `--license <l>` | Restrict to SPDX license(s) (`MIT,Apache-2.0`) |
| `--style <s>` | Prefer a style: `outline`, `fill`, `duotone`, `round`, … |
| `--no-expand` | Disable synonym expansion (exact terms only) |
| `--json` | Machine-readable JSON output |
| `-g, --generate` | Generate a square SVG via LLM instead of searching (see below) |
| `--gen-provider <p>` | `minimax` \| `anthropic` \| `openai` (default: autodetect from env) |
| `--gen-model <m>` | Override the generation model id |
| `--gen-retries <n>` | Max generate→validate→repair attempts (default 3) |
| `-h, --help` | Show help |

---

## How matching works

Three layers run in parallel on every call and merge into one ranked list:

| Layer | Handles | How |
| --- | --- | --- |
| **Iconify** (`providers/iconify.ts`) | generic UI icons (`home`, `settings`) | Iconify full-text search via the public `api.iconify.design` |
| **Brand** (`providers/brand.ts`) | brand logos (`docker`, `kubernetes`, `redis`) | fetches full inventories of brand sets (`logos`, `devicon`, `simple-icons`, …) into memory, matches locally |
| **Vendor** (`providers/vendor.ts`) | cloud **services** (`emr`, `sagemaker`, `cosmos db`, `bigquery`) | official AWS/Azure/GCP SVGs from [`tf2d2/icons`](https://github.com/tf2d2/icons), indexed in memory |

Iconify's full-text search has poor recall for product names — `s3` is named
`logos:aws-s3`, `kafka` is `simple-icons:apachekafka`, and many cloud services
aren't in Iconify at all. The brand/vendor layers fix this by matching against
complete inventories with **vendor-prefix stripping** (`aws-`, `azure-`,
`apache-`, `amazon-`, …) and concatenated-slug matching. All upstream data is
held **in memory for the run only** — nothing is persisted.

Ranking keeps the tiers in their lanes: a literal whole-name match wins (generic
word → UI glyph), a colored brand logo beats a monochrome glyph for brand names,
and official vendor icons win for cloud services.

### Disambiguating ambiguous names

A few bare words double as common icons (`athena`, `glue`, `lambda`):

```bash
icon-search "aws athena"        # natural qualifier  → logos:aws-athena
icon-search athena --set aws    # restrict to AWS    → aws:Amazon Athena (official)
```

`--set aws|azure|gcp` is also how you get a **visually consistent** official icon
set for a whole architecture diagram.

> Vendor icons are trademarked AWS/Microsoft/Google logos, licensed for use in
> architecture diagrams — not generic open-source icons.

---

## Recoloring

Color customization depends on the icon type. All three modes are pure stdout
transforms (nothing written to disk):

| Icon type | Use | Result |
| --- | --- | --- |
| Monochrome (`mdi`, `material-symbols`, `simple-icons`, …) | `--color <c>` | recolors cleanly (these use `currentColor`) |
| Multi-color logo / gradient, want a flat tint | `--color <c> --flatten` | one flat color |
| Multi-color logo / gradient, want to keep depth | `--color <c> --gradient` | re-hued to the new primary, **shading preserved** |

```bash
icon-search home --best --color "#ff0066"                 # themeable monochrome
icon-search docker --best --color "#444" --flatten        # flat single color
icon-search "cosmos db" --best --color "#ff0066" --gradient
#   gradient #5ea0ef→#0078d4 (blue) becomes #ff4e95→#d40055 (pink), depth kept
```

Color accepts hex (`#ff0066`, `#f06`), `rgb(...)`, and common names (`red`, `teal`, …).

---

## Generating icons (LLM fallback)

When no icon set has what you need, `--generate` synthesizes a **square** SVG via
a multimodal LLM. It's an agent loop: generate → validate (well-formed + 1:1
viewBox) → on failure feed the reason back to repair, up to N attempts. Output
goes to stdout — still stateless.

```bash
icon-search "a data pipeline with three connected nodes" --generate
icon-search "shield with check mark" --generate --color "#2563eb"   # then recolor
icon-search "cloud upload" --generate --gen-provider openai --gen-model deepseek-ai/DeepSeek-V3
```

Generated icons are monochrome (`currentColor`) by default so `--color` recolors
them cleanly. Square aspect ratio is guaranteed in code (a non-square result is
padded symmetrically to a square canvas).

### Generation backends (configured via env vars)

| Protocol | Env vars | Notes |
| --- | --- | --- |
| Anthropic Messages | `MINIMAX_ANTHROPIC_API_KEY`, `MINIMAX_ANTHROPIC_BASE_URL`, `MINIMAX_ANTHROPIC_MODEL` | MiniMax (default when set); also works with real Claude |
| OpenAI Chat | `OPENAI_API_KEY` (or `ICON_GEN_API_KEY`), `OPENAI_BASE_URL`, `OPENAI_MODEL` | any OpenAI-compatible gateway (SiliconFlow, vLLM, …) |

Autodetect order: `ICON_GEN_PROVIDER` → MiniMax → OpenAI. Override per call with
`--gen-provider` / `--gen-model`. SVG quality scales with the model — a small 7B
model often can't emit clean SVG (the loop retries, then fails cleanly with exit
2); use a capable model (DeepSeek-V3, Qwen-72B, GPT-4o, Claude, MiniMax-M3).

> Note: MiniMax's `image-01` is a raster image model and is **not** used here —
> SVG generation needs a text LLM that writes SVG code.

---

## Architecture

```
src/
  cli.ts            CLI entry — arg parsing, output, recolor, generate dispatch
  pipeline.ts       IconSearch: fan out providers → rank → lazily resolve SVGs
  providers/        iconify · brand · vendor (each implements IconProvider)
  match.ts          shared fuzzy matching (vendor-prefix stripping, depluralize)
  ranker.ts         scoring / tiering across providers
  synonyms.ts       curated query expansion
  svg.ts            validate · normalize · extractSvg · enforceSquare
  color.ts          recolor (theme / flatten / retint-gradient)
  generate/         pluggable LLM backends + agent repair loop
  cache.ts          in-memory, process-scoped only (no disk)
```

**Pipeline**: *expand* query (synonyms) → *search* all providers in parallel →
*rank* (literal-name match strongest; tiered by set type) → *resolve* SVGs
lazily, validating each.

**Extending**: implement the `IconProvider` interface (`src/providers/types.ts`,
just `search()` + `fetchSvg()`) and pass it to `new IconSearch([...])`. Add a
generation backend by implementing `ChatBackend` (`src/generate/types.ts`).

## Roadmap

- Embedding-based semantic ranking (swap the curated synonym table).
- Last-resort fallback: web image search + raster→SVG vectorization.
- HTTP API / web UI front-ends over the same pipeline.

## License

MIT (the code). Icon assets retain their respective upstream licenses — see each
result's `license` field; cloud-vendor icons are trademarked (diagram use).
