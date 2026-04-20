# feedr — a workflow-first search for LCSC / JLCPCB parts

A static site that reimagines LCSC/JLCPCB search around how engineers actually pick
components for JLCPCB assembly:

- **Semantic shorthand** — type `100n 0402 x7r`, get capacitance normalized to Farads,
  package canonicalized to imperial, and a tempco filter applied in one shot.
- **Tiered results** — JLC **Basic** first (zero feeder fee), then **Reputable Extended**
  (global Tier-1 brands), then **Economy Extended** (domestic brands with popularity scores).
- **Brand reputation** — ~30 manufacturers tagged with tier, country, and usage notes.
- **Parametric filters** — Digi-Key-style facets driven by values stored in SI base units.

Zero build step. Zero backend. Open `index.html` from a local web server and it works.

## Running it

The site uses ES modules, so it won't load from a raw `file://` URL. Run any static
server in the project root:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Or:

```
npx serve .
```

## GitHub Pages

This repo now includes GitHub Actions workflows for GitHub Pages:

- `.github/workflows/deploy-pages.yml` deploys the static site on pushes to `main`.
- `.github/workflows/refresh-snapshot.yml` refreshes the parts snapshot daily at `03:17` UTC, commits any updated `data/*`, and deploys the refreshed site.

After pushing the repo to GitHub, enable Pages in the repository settings and set the source to **GitHub Actions**.

## Project layout

```
index.html          # Landing page
search.html         # Tiered results (takes ?q=…)
category.html       # Parametric faceted browse (?cat=…)
part.html           # Single-part detail (?lcsc=…)
css/                # tokens, base, components, layout
js/
  parser.js         # Engineer-shorthand parser
  tiers.js          # Tier metadata
  search.js         # In-memory query engine
  data-loader.js    # Lazy shard loader + cache
  format.js         # Display formatters
  ui/               # Nav, chips, result rows, brand badges
  pages/            # One script per HTML page
data/
  brands.json       # Brand → {tier, country, popularity, known_for}
  snapshot-meta.json
  categories/       # One shard per category
scripts/
  build-data.js     # CSV → sharded JSON pipeline
```

## Refreshing the parts snapshot

The repo ships with a snapshot pulled from the
[yaqwsx/jlcparts](https://yaqwsx.github.io/jlcparts/) public mirror of the
JLCPCB component library. To rebuild it from the full mirror:

```
rm -rf .cache-jlc           # optional: drop cached downloads
node scripts/ingest-jlcparts.js
```

This downloads the `index.json` manifest plus every per-subcategory
`*.json.gz` + `*.stock.json` file, keeps all in-stock parts, normalizes the
parametrics this UI knows how to search, classifies each row into broad shards,
and writes to `data/categories/*.json` + `data/snapshot-meta.json`. Parts that
do not fit the main browse buckets land in `data/categories/other.json`.

If you have the official JLCPCB CSV (from your jlcpcb.com account) instead and
want to use that, the older pipeline is preserved at `scripts/build-data.js`:

```
node scripts/build-data.js /path/to/JLCPCB_SMT_Parts_Library.csv
```

## Parser quick reference

| Input                 | Recognized as                                 |
|-----------------------|-----------------------------------------------|
| `100n`, `0.1uF`       | 100 nF capacitance (→ category `capacitors`)  |
| `4k7`, `4.7k`, `4700Ω`| 4.7 kΩ resistance (→ category `resistors`)    |
| `1R5`, `0R22`         | Ohms with R-as-decimal-point                  |
| `10uH`                | 10 µH inductance                              |
| `0402`, `1005`        | Imperial 0402 package (metric 1005 aliased)   |
| `SOT-23-5`, `LQFP-48` | Discrete / IC packages                        |
| `1%`, `±5%`           | Tolerance                                     |
| `50V`, `6.3V`         | Voltage rating                                |
| `X7R`, `C0G`, `NP0`   | Capacitor temperature coefficient             |
| `cap`, `res`, `led`…  | Category shortcuts                            |
| `ldo`, `opamp`, `buck`| IC function tags                              |
| `red`, `blue`         | LED color (+ infers category)                 |
| `STM32F103`, `AO3400` | MPN prefixes (skip parametric parsing)        |

Tokens that don't match any of the above are kept as free-text and substring-matched
against manufacturer, MPN, and description.

## What's deliberately simple

- Data is loaded fully into memory per category. The full mirror is much larger than
  the original demo snapshot, so search will likely need pagination or an on-disk
  index if you want this to stay responsive at full catalog scale.
- There's no real-time stock sync. The snapshot is frozen to whatever CSV you built
  from.
- The chip-dismissal path uses a heuristic token match rather than a reversible
  AST. Works for the chip shapes the parser produces; edge cases fall back to
  "remove and retry" behavior.
