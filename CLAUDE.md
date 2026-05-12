# RealMap — Project Specification

> Read this before every session. These requirements do not change without explicit
> user instruction. When in doubt, consult these principles.

---

## Vision

A scientific cartography of human food culture. ~6500 cities. 289 culinary dimensions.
Color distance = culinary distance. The map paints itself through data — nothing else
determines a city's color.

---

## Core Principles

0. **100% scientific, no exceptions.** Every ingredient score must be defensible against
   real ethnographic, anthropological, or culinary science sources. No values are chosen
   to make cities look visually distinct, to pass tests, or to match expectations. If two
   cities genuinely share a cuisine, they share colors — that is correct. Never adjust
   data to achieve a desired visual outcome. Every change to ingredient scores must have
   a factual justification (academic source, food science, documented culinary tradition).
   Do not tune UMAP seeds to pass specific color tests — the seed only affects rotation,
   not topology, and should be chosen for global layout quality, not to satisfy hand-
   picked pairs. When test expectations conflict with data truth, fix the tests, not the data.

1. **Zero geographic/political bias.** Color comes from food data alone. No continent
   zones, no country buckets, no regional groupings in color assignment. If Ethiopian
   and Indian cities share spice/legume profiles, they share hues. That is correct —
   it reveals a real culinary connection. Never override it with geography.

2. **Variance is the point.** Istanbul vs. Trabzon vs. Gaziantep vs. İzmir should all
   look different. Regional diversity within a country is what makes this map valuable.
   Cities must be scored independently, not inherited from country stereotypes.

3. **Honest, PhD-level data.** Every ingredient score is defensible against real
   culinary sources. Scores reflect what locals eat daily, not restaurant menus or
   tourist food. No clichés, no stereotypes, no padding.

4. **Global consistency.** rice=0.95 in Tokyo means the same as rice=0.95 in Bangkok.
   The scale is global. Normalization happens globally, not per-region.

5. **Chili bridges are correct.** High chili usage correctly links India, Mexico,
   Korea, Ethiopia, Sichuan. They ARE connected along that dimension. The 12D embedding
   separates them in all other dimensions (fat type, starch, fermentation, aromatics).
   Do not suppress this signal.

6. **2D color wheel, not 1D rope.** Food cultures form a 2D sheet with clusters and
   bridges — not a 1D line. Hue comes from the 2D UMAP color embedding (angle in the
   2D plane), not from a linear rank ordering. This prevents topology artifacts.

---

## Data Quality Standards

**Fundamental rules (non-negotiable):**

- **Each city must be handled per-city.** Every city in every `data/raw/data.*.json` file must have its own individually researched ingredient and cooking method scores. No city may share a byte-identical profile with any other city. The scores must reflect what people actually eat and cook in THAT SPECIFIC CITY — not its region, not its country, not its cultural zone.

- **No regional or zone-based assignment.** Do not write code that assigns cities to zones and gives them zone profiles. If two cities happen to have similar scores, that is fine — but the similarity must be because the data is genuinely similar, not because they were given the same template. Each city's data must be independently entered and justified.

- **All raw ingredient and method keys must be handled.** Every key used in any `data/raw/data.*.json` file must either exist in `master_ingredients.json` / `master_methods.json`, or have a mapping in `canonical_keys.json`. Zero unknown keys is the required state.

- **Global culinary coverage.** The dataset must cover world cuisine with the same scientific rigor everywhere — from İzmir to London to Lagos to Tokyo. No city is treated as less important than another. Every city's data should be the result of the same level of research.

**Per-city requirements:**
- ≥ 8 meaningfully scored ingredients (not just universal staples)
- Signature local ingredients MUST be present and scored:
  - `teff`, `injera`, `berbere` in Ethiopian cities
  - `miso`, `dashi`, `nori` in Japanese cities
  - `za'atar`, `sumac` in Levantine cities
  - `saffron`, `rose_water` in Iranian cities
  - `pistachio` in Gaziantep
  - `anchovy` in Trabzon
  - `harissa` in Tunis/Algiers
  - `maple_syrup` in Montreal/Quebec
  - `gochujang` in Korean cities
  - `preserved_lemon` in Moroccan cities
  - etc.

**Reject all of:**
- Filler values: 0.44, 0.4656, 0.4386, 0.4325, 0.4086, 0.3694 (full list in validate_data.py)
- Generic keys: `herb`, `herbs`, `seafood`, `vegetables`, `spices`, `chili_peppers`
- Stuffing as a cooking method

**Feature space dimensions (what good city data captures):**

| Dimension | Key features |
|-----------|-------------|
| Starch base | rice, wheat, corn, potato, cassava, flatbread, teff, quinoa |
| Protein | beef, pork, lamb, fish, chicken, legumes/bean, tofu, egg |
| Fat type | olive_oil, butter, ghee, coconut_oil, palm_oil, lard |
| Heat | chili_pepper (global bridge — correctly connects spice cultures) |
| Fermented | soy_sauce, miso, fermented_fish, kimchi, cheese, yogurt, injera |
| Aromatics | garlic, ginger, onion — quantities discriminate even universal ingredients |
| Signature spices | saffron, za'atar, berbere, ras_el_hanout, gochujang, tandoori_masala |
| Local staples | teff, yam, plantain, breadfruit, poi, injera, quinoa |
| Technique | fermenting, stir_frying, tandoor, earth_oven, smoking, pickling |

---

## Embedding Design

### 12D UMAP — structural embedding
```
n_components=12, metric=cosine, n_neighbors=20, min_dist=0.05, random_state=42
```
Purpose: city similarity, CityDrawer "similar cities", Elasticsearch search.

### 2D UMAP — color embedding
```
n_components=2, metric=cosine, n_neighbors=15, min_dist=0.10, random_state=51
```
Purpose: Hue assignment ONLY. n_neighbors=15 keeps tight local neighborhoods so
cross-cultural connections (Palermo→N.Africa, Venice→Central Europe) dominate over
within-country similarity — n_neighbors≥20 collapses all Italian cities to one point.
Seed=51 is the canonical fixed seed for reproducibility — it is NOT tuned to satisfy
any specific city pair. Changing the seed to force a desired color separation is bias.
When data changes cause layout shifts, the layout shift is the expected correct behavior.

**Color mapping limitation (inherent, not a bug):**
Mapping 289D food space to a 1D circular hue is inherently lossy. Some culinarily
distinct city pairs will appear at similar hue angles — this is a projection artifact,
not a data error. The largest improvements to color quality come from data quality
(unique, accurate city profiles) not from pipeline parameter tuning. Do not adjust
UMAP parameters, seeds, or calibration to fix specific pairs — fix the data instead.

Color mapping — **H/C/L are fully independent axes**:
- **Hue H**: `atan2(hue2d[1], hue2d[0]) + π` → histogram-equalized via 512-pt CDF → [0°, 360°]
- **Chroma C**: `|wNorm|` (|PC3| of 12D PCA) → histogram-equalized via `w_abs_percentiles` → [0.12, 0.38]
  Why PC3 not 2D radius: tight clusters (Japan, Korea) collapse to UMAP center → radius≈0.04 → near-gray.
  PC3 is orthogonal to the hue plane and captures a real culinary dimension.
- **Lightness L**: `sqrt(uNorm² + vNorm²)` (PC1+PC2 plane magnitude) → equalized via `uv_magnitude_percentiles` → [0.54, 0.82]
  Measures culinary distance from the global mean — distinctive cuisines score high → bright.

Stored in `features.json` as `hue2d: [x, y]` (normalized 2D UMAP coordinates).
`global_color_calibration.json` (version "3") contains: B, mu, sigma, quantiles,
`angle_percentiles`, `w_abs_percentiles`, `uv_magnitude_percentiles`.

### Why 2D not 1D
1D forces a linear ordering onto 2D/3D manifold data → topology artifacts
(disconnected cuisines land adjacent on the 1D rope). 2D preserves neighborhood
structure in both dimensions. The color wheel is the natural representation.

---

## Color Rendering

- **Color space**: OKLCH (perceptually uniform — gradients look smooth in all browsers)
- **Gamut clipping**: binary-search compression, preserves H first, L second, compresses C
- **Browser targets**: Chrome/macOS (P3), Chrome/Windows (sRGB), Firefox, Safari
- **L range**: [0.54, 0.82] — no muddy darks, no blown-out highlights
- **C range**: [0.12, 0.38] — never gray (min C ensures vibrancy), never oversaturated
- **Final output**: sRGB hex via chroma.js — safe on all displays

---

## Test Requirements (300+ total)

Run after every build: `python3 data/validate_data.py`

**Structural tests**: Zero fillers, no generic keys, no stuffing method  
**Presence tests**: ~40 pairs — culturally defining ingredients must exist  
**Similarity tests**: ~200 pairs — cosine bounds across same-tradition / cross-cultural  
**Color tests**: ~60 pairs — hue separation guarantees for culinarily distinct cities  
**Statistical**: ≥80% of cross-continental top-200 pairs have ≥10° hue diff  

---

## What This Is NOT

- Not a geographic atlas (color ≠ continent or country)
- Not a restaurant guide or tourist food map
- Not a demographic, political, or ethnic map
- Not country-level aggregation (cities matter independently)

---

## Key Files

| File | Role |
|------|------|
| `data/raw/data.*.json` | Source truth — 241 country/region files |
| `packages/scripts/src/buildClusters/run.py` | Full UMAP pipeline |
| `packages/scripts/src/buildClusters/clean_raw.py` | Data cleaning |
| `packages/scripts/src/buildClusters/canonical_keys.json` | Spelling normalization |
| `packages/scripts/src/buildClusters/master_ingredients.json` | 348-key ingredient whitelist |
| `packages/scripts/src/buildClusters/master_methods.json` | 26-key method whitelist |
| `data/features.json` | Build output: 6559 cities with embeddings |
| `data/global_color_calibration.json` | Build output: PCA/UMAP calibration |
| `data/validate_data.py` | Test suite (must all pass) |
| `data/color_report.py` | Visual HTML report |
| `packages/client/src/utils/colorUtils.ts` | getCityColor() — embedding → OKLCH |
| `packages/client/src/utils/mapUtils.ts` | GeoJSON layer management |
| `packages/client/src/components/CityDrawer.tsx` | City detail panel |
| `Makefile` | Pipeline orchestration |

## Build Commands

```bash
make build-clusters    # Run UMAP pipeline → features.json + calibration artifacts
make color-report      # Generate visual HTML report → data/color_report.html
make seed-cities       # Load features.json → Elasticsearch index
make clean-raw         # Normalize & clean raw data files
make dev-clean         # Full reset: Elasticsearch + build + seed + start dev servers
```

## Pre-Push Checklist (required before every git push)

**Never push without running these first:**

```bash
cd packages/client && npx tsc --noEmit    # TypeScript must be error-free
```

If the build is relevant (new components, changed imports):
```bash
pnpm --filter @realmap/client build       # Full Vite build must succeed
```

Only push after both pass with zero errors.

## Grid and Color Design

**Hex grid (H3):**
- Resolution 4 (~288k cells globally, ~22km side) — required for correct coverage of small islands (Cyprus, Malta, Aegean), narrow peninsulas, and coastal detail.
- Land mask: Natural Earth 50m (~1420 polygons) — required to capture all Balkan countries, small islands, and complex coastlines.
- Black hex cells = ocean (correct). No black cells on land.
- Color blending: `BLEND_SIGMA_KM = 200` — Gaussian blend sigma in km. Controls gradient smoothness between city color points.
- Gradients must be visible and smooth — the color should flow continuously across adjacent hex cells, not jump.

**Color mapping pipeline (H/C/L are independent):**
- H (Hue): 2D UMAP angle, histogram-equalized to spread across full 360°
- C (Chroma): |PC3| of 12D PCA, equalized → [0.12, 0.38] — never gray, never oversaturated
- L (Lightness): sqrt(uNorm² + vNorm²) of PC1+PC2, equalized → [0.54, 0.82]
- OKLCH color space, gamut-clipped, output as sRGB hex

## Validation

Two validators must both pass after any data or pipeline change:

```bash
python3 data/validate_all.py    # full-coverage structural validation (no custom logic)
python3 data/validate_data.py   # curated culinary pair tests
```

`validate_all.py` rules (schema-derived, no hard-coded city names):
- All ingredient/method keys must be in master whitelists
- No filler values, no generic keys, no banned methods
- ≥ 8 ingredients with score > 0; ≥ 4 with score ≥ 0.5
- Country FAIL if ≥ 80% of city pairs have cosine ≥ 0.99 (copy-paste detection)

Ideal target: 0 FAIL countries, minimal WARN. Current state reflects data completeness.

## Current Build State

- ~5800 cities validated, 289 features (265 ingredients + 24 methods)
- 12D UMAP structural embedding (n_neighbors=20, seed=42)
- 2D UMAP color embedding (n_neighbors=15, seed=51) — **calibration version 3**
- Color: H = 2D UMAP angle equalized, C = |PC3| equalized, L = uv_magnitude equalized
- `make build-clusters` runs both validators post-build
- Data quality: 112 countries FAIL validation (mostly homogeneous copy-pasted profiles)
  → fixing city-level differentiation is the primary quality improvement lever
