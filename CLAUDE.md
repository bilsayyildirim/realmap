# RealMap — Project Specification

> Read before every session. These principles do not change without explicit user
> instruction. When in doubt, consult them.

---

## Vision

A scientific cartography of human food culture. ~6500 cities. ~290 culinary
dimensions. Color distance = culinary distance. The map paints itself through
data — nothing else determines a city's color.

---

## The One Rule

**Score each city from real local cuisine. Never from country, region, religion,
politics, or visual outcome. The goal is the unbiased world as it is.**

Everything below is a consequence of this rule.

---

## Mandatory Workflow — Never Stop Until Perfect

After every data or pipeline change:

1. Run `python3 /tmp/audit_map.py` (or equivalent) to compute per-country
   angular hue spread across all 240+ country files. A country with
   ≥30 cities and **angular spread < 30°** (no significant gap in its sorted
   hue circle) is **templated** — fix it. (Stdev is an inferior metric:
   cuisines that legitimately cluster around one cuisine center will have low
   stdev but acceptable spread; only true templating compresses spread.)
2. Sample hex colors at known city lat/lon to verify the map visually matches
   real culinary geography (e.g., Aegean Turkey should hue-band with
   Mediterranean Europe, not Anatolian interior).
3. Identify the highest-impact remaining templating (largest cities × lowest
   hue stdev) and fix that country next.
4. Rebuild (`make build-clusters`), re-audit, repeat.
5. **Do not stop** while any country with ≥30 cities still has hue stdev < 15°,
   or any visible region on the world map looks monochrome where the
   underlying cuisines are genuinely diverse. Perfect = honest variance
   everywhere; templated zones are never acceptable.

The audit is what "looking at the map" means for the assistant — it does not
need a screenshot to know the state of the world.

---

## Data Principles (non-negotiable)

1. **Per-city, independently scored.** Every city in `data/raw/data.*.json` has
   its own profile, researched from what people in THAT city actually eat —
   not its country, not its region, not its ethnic zone. No two cities share a
   byte-identical profile, and similarity (when it exists) must reflect genuine
   culinary kinship, not a shared template.

2. **No templates, no national defaults, no zone assignment code.** Do not
   write helpers that paint cities from a country/regional palette. If you find
   yourself copy-pasting a profile, stop — research the next city instead.

3. **PhD-level defensibility.** Every score must trace to ethnographic,
   anthropological, or culinary-science grounding (what locals eat daily — not
   restaurants, not tourist menus, not stereotypes). If you can't justify a
   score against real food culture, don't write it.

4. **Globally consistent scale.** `rice=0.95` in Tokyo means the same as in
   Bangkok. Normalization is global; never per-country, never per-continent.

5. **Honest similarity is correct.** If two cities genuinely share a cuisine,
   they share colors — that is a true finding, not a bug. Do not invent
   differences to force visual separation. Do not chase cosine thresholds.

6. **Zero geographic/political bias in coloring.** Color comes only from food
   data. No continent zones, no country buckets, no regional priors. If
   Ethiopian and Indian cities share spice/legume profiles, they share hues —
   that reveals a real connection. Never override it with geography.

7. **Chili / fermentation / oil bridges are signal, not noise.** High chili
   correctly links India, Mexico, Korea, Ethiopia, Sichuan along one axis. The
   12D structural embedding separates them on every other axis (fat, starch,
   ferment, aromatics). Do not suppress cross-cultural bridges.

8. **Tests serve the data, not vice versa.** When a test expectation conflicts
   with food truth, fix the test. Do not edit data to satisfy a hand-picked
   pair, do not tune UMAP seeds to chase pair separation.

---

## Per-City Requirements

- ≥ 8 meaningfully scored ingredients (universal staples alone don't count)
- ≥ 4 ingredients with score ≥ 0.5
- Each city covers most of: starch, protein, fat, aromatics, ferment, signature
- Signature ingredients **must** appear where they belong, e.g.:
  - `teff`, `injera`, `berbere` in Ethiopian cities
  - `miso`, `dashi`, `nori` in Japanese cities
  - `za'atar`, `sumac` in Levantine cities
  - `saffron` in Iranian / Khorasan cities
  - `pistachio` in Gaziantep, `anchovy` in Trabzon
  - `harissa` in Tunis / Algiers
  - `maple_syrup` in Montréal / Québec
  - `gochujang` in Korean cities
  - `preserved_lemon` in Moroccan cities

## Forbidden

- Filler values (full list in `validate_data.py`): 0.44, 0.4656, 0.4386, 0.4325,
  0.4086, 0.3694, 0.3256, 0.2944
- Generic keys: `herb`, `herbs`, `seafood`, `vegetables`, `spices`, `chili_peppers`
- `stuffing` as a cooking method
- Any ingredient/method key not in `master_ingredients.json` /
  `master_methods.json` (or mapped via `canonical_keys.json`)
- Byte-identical city profiles

---

## Pipeline (do not tune to chase pairs)

### Structural embedding — 12D UMAP
```
n_components=12, metric=cosine, n_neighbors=20, min_dist=0.05, random_state=42
```
Used for similarity search (CityDrawer "similar cities", Elasticsearch).

### Color embedding — 3D PCA (deterministic)
```
PCA(n_components=3) on raw 364-D feature matrix
```
Used **only** for hue/chroma/lightness. PCA is the right tool here, not UMAP:
- **Deterministic** (no random seed dependence).
- **Preserves global variance**: the most culinarily-different cuisines land
  furthest apart in the 3D output. UMAP previously collapsed unrelated
  cuisines onto the same hue angle (e.g. Scandinavian raw-cosine 0.22 to
  Iranian came out at UMAP-cosine 0.71, both rendering red-pink). PCA does
  not have this failure mode.
- **PC1 / PC2 / PC3** typically capture: dominant staple/protein axis, fat
  type / fermentation axis, signature spice axis.

### Color formula — H/C/L are independent axes
- **Hue H** = `atan2(PC2, PC1)` of 3D PCA, equalized via `angle_percentiles`
  → [0°, 360°]. Macro-clusters get the full angular spread.
- **Chroma C** = `|PC3|` (orthogonal to the hue plane), equalized →
  [0.12, 0.38]. Distinguishes cities sharing H but differing on the third axis.
- **Lightness L** = `√(PC1² + PC2²)`, equalized → [0.54, 0.82]. Distinctive
  cuisines score high → bright.

Output: OKLCH → gamut-clipped sRGB hex via chroma.js.

`global_color_calibration.json` carries: `angle_percentiles`,
`w_abs_percentiles`, `uv_magnitude_percentiles`, plus B/mu/sigma/quantiles.

**Inherent limitation:** mapping ~290D food space to a 1D circular hue is
lossy — some culinarily distinct pairs land at similar hue angles. Fix this by
improving data, not by tuning UMAP parameters.

---

## Hex Grid (display)

- H3 resolution 4 (~22 km side) — required for small islands and coastlines
- Natural Earth 50m land mask — captures Balkans, archipelagos, peninsulas
- Vector tile basemap (CartoDB dark-matter GL) — hex fills inserted **before**
  the `water` layer so the ocean polygon clips coastlines pixel-perfect
- `BLEND_SIGMA_KM = 200` — Gaussian smoothing for cell colors
- Gradients must flow continuously between adjacent cells

---

## What This Is NOT

- Not a geographic atlas (color ≠ continent or country)
- Not a restaurant or tourist guide
- Not a demographic, political, religious, or ethnic map
- Not country-level aggregation — cities matter independently

---

## Files

| File | Role |
|------|------|
| `data/raw/data.*.json` | Source truth (one file per country/region) |
| `packages/scripts/src/buildClusters/run.py` | UMAP + PCA + OKLCH pipeline |
| `packages/scripts/src/buildClusters/clean_raw.py` | Data cleaning |
| `packages/scripts/src/buildClusters/canonical_keys.json` | Spelling normalization |
| `packages/scripts/src/buildClusters/master_ingredients.json` | Ingredient whitelist |
| `packages/scripts/src/buildClusters/master_methods.json` | Method whitelist |
| `data/features.json` | Build output: cities with embeddings + colors |
| `data/global_color_calibration.json` | Build output: per-axis CDFs |
| `data/validate_data.py` | Curated culinary pair tests |
| `data/validate_all.py` | Full-coverage structural validation |
| `packages/client/src/utils/colorUtils.ts` | `getCityColor()` → OKLCH |
| `packages/client/src/utils/mapUtils.ts` | Map layers (points, hex, voronoi, glow) |
| `packages/client/src/components/Map.tsx` | Map component |
| `Makefile` | Pipeline orchestration |

## Commands

```bash
make build-clusters    # Full pipeline: features.json + calibration + hex grid
make color-report      # Visual HTML diff → data/color_report.html
make seed-cities       # Index features.json into Elasticsearch
make clean-raw         # Normalize raw data files
make dev-clean         # Full reset: ES + build + seed + dev servers
```

## Validation

Both must pass after any data or pipeline change:

```bash
python3 data/validate_all.py    # structural (schema-derived, all cities)
python3 data/validate_data.py   # curated culinary pair tests
```

`validate_all.py` rules:
- All keys must be in master whitelist or canonical mapping
- No filler values, no generic keys, no banned methods
- ≥ 8 ingredients scored > 0; ≥ 4 scored ≥ 0.5
- Country FAIL if ≥ 80% of city pairs share cosine ≥ 0.99 (copy-paste detection)

## Pre-Push Checklist

Never push without:
```bash
cd packages/client && npx tsc --noEmit
```
And for client-relevant changes:
```bash
pnpm --filter @realmap/client build
```
