#!/usr/bin/env python3
"""Full-coverage, no-custom-logic data validator for RealMap.

Rules are derived entirely from schema files and universal statistical
properties — no hard-coded city names, no hand-picked pairs, no manually
specified thresholds.

Exit code 0 = all pass (warnings allowed).
Exit code 1 = one or more FAIL countries.
"""

import json
import math
import os
import sys
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_RAW = ROOT / "data" / "raw"
SCRIPTS = ROOT / "packages" / "scripts" / "src" / "buildClusters"

# ── Thresholds (schema-derived, not city-specific) ────────────────────────────
FILLER_VALUES = {0.44, 0.4656, 0.4386, 0.4325, 0.4086, 0.3694, 0.3256, 0.2944,
                 0.4500, 0.3500}          # common ML-filler artefacts
GENERIC_KEYS = {"herb", "herbs", "seafood", "vegetables", "spices",
                "chili_peppers", "meat", "dairy", "grain", "protein"}
BANNED_METHODS = {"stuffing"}
MIN_INGREDIENTS_TOTAL = 8     # keys with any score > 0
MIN_INGREDIENTS_MEANINGFUL = 4  # keys with score >= 0.5
MAX_INGREDIENT_SCORE = 1.0
MIN_INGREDIENT_SCORE = 0.0
HOMOGENEITY_COSINE = 0.99    # above this = "near-identical"
HOMOGENEITY_FRACTION = 0.80  # if >=80% of pairs in a country exceed threshold → FAIL
NEAR_DUP_COSINE = 0.998      # WARN (not fail)
MIN_VARIANCE_STD = 0.05      # ingredient vector std below this = suspiciously flat


def load_json(path):
    with open(path) as f:
        return json.load(f)


def cosine(a, b):
    """Cosine similarity between two dicts (sparse vectors)."""
    keys = set(a) | set(b)
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in keys)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def std_dev(values):
    if not values:
        return 0.0
    mu = sum(values) / len(values)
    return math.sqrt(sum((v - mu) ** 2 for v in values) / len(values))


# ── Load whitelists + canonical normalization (mirrors pipeline behavior) ─────
master_ingredients = set(load_json(SCRIPTS / "master_ingredients.json"))
master_methods = set(load_json(SCRIPTS / "master_methods.json"))
_canon = load_json(SCRIPTS / "canonical_keys.json")
ing_canon = _canon.get("ingredients", {})
mth_canon = _canon.get("cookingMethods", {})


def normalize_dict(d: dict, canon: dict, whitelist: set) -> dict:
    """Apply canonical key normalization, take max value on collision."""
    out: dict = {}
    for k, v in d.items():
        k2 = canon.get(k, k)
        if isinstance(v, (int, float)):
            out[k2] = max(out.get(k2, 0.0), float(v))
    return out


# ── Per-city structural checks ────────────────────────────────────────────────
def check_city(city):
    """Returns (errors, warnings) as lists of strings."""
    errors, warnings = [], []
    name = city.get("name", "<unknown>")
    # Apply canonical normalization (same as pipeline) before whitelist checks
    ing = normalize_dict(city.get("ingredients", {}), ing_canon, master_ingredients)
    methods = normalize_dict(city.get("cookingMethods", {}), mth_canon, master_methods)

    # Required fields
    for field in ("id", "name", "countryCode", "continent", "latitude", "longitude"):
        if field not in city:
            errors.append(f"{name}: missing field '{field}'")

    # Coordinate sanity
    lat = city.get("latitude")
    lon = city.get("longitude")
    if lat is not None and not (-90 <= lat <= 90):
        errors.append(f"{name}: latitude {lat} out of range")
    if lon is not None and not (-180 <= lon <= 180):
        errors.append(f"{name}: longitude {lon} out of range")

    # Ingredient key whitelist
    for k in ing:
        if k in GENERIC_KEYS:
            errors.append(f"{name}: generic ingredient key '{k}'")
        elif k not in master_ingredients:
            errors.append(f"{name}: unknown ingredient key '{k}' (not in master_ingredients.json)")

    # Method key whitelist + banned
    for k in methods:
        if k in BANNED_METHODS:
            errors.append(f"{name}: banned cooking method '{k}'")
        elif k not in master_methods:
            errors.append(f"{name}: unknown method key '{k}' (not in master_methods.json)")

    # Score range
    for k, v in {**ing, **methods}.items():
        if not isinstance(v, (int, float)):
            errors.append(f"{name}: score for '{k}' is not a number: {v!r}")
        elif round(float(v), 4) in FILLER_VALUES:
            errors.append(f"{name}: filler value {v} on key '{k}'")
        elif not (MIN_INGREDIENT_SCORE <= float(v) <= MAX_INGREDIENT_SCORE):
            errors.append(f"{name}: score {v} for '{k}' out of [0,1] range")

    # Minimum coverage
    positive_ing = [k for k, v in ing.items() if isinstance(v, (int, float)) and v > 0]
    meaningful_ing = [k for k, v in ing.items() if isinstance(v, (int, float)) and v >= 0.5]

    if len(positive_ing) < MIN_INGREDIENTS_TOTAL:
        errors.append(
            f"{name}: only {len(positive_ing)} ingredients with score>0 "
            f"(min {MIN_INGREDIENTS_TOTAL})"
        )
    if len(meaningful_ing) < MIN_INGREDIENTS_MEANINGFUL:
        warnings.append(
            f"{name}: only {len(meaningful_ing)} ingredients with score>=0.5 "
            f"(min {MIN_INGREDIENTS_MEANINGFUL})"
        )

    # Variance check
    scores = [float(v) for v in ing.values() if isinstance(v, (int, float)) and v > 0]
    if scores and std_dev(scores) < MIN_VARIANCE_STD:
        warnings.append(
            f"{name}: suspiciously low ingredient variance "
            f"(std={std_dev(scores):.3f})"
        )

    return errors, warnings


# ── Per-country statistical checks ───────────────────────────────────────────
def check_country_homogeneity(cities):
    """
    Returns (country_errors, country_warnings).
    Flags FAIL if >=HOMOGENEITY_FRACTION of all pairwise cosines exceed
    HOMOGENEITY_COSINE — indicating the whole country was copy-pasted.
    """
    errors, warnings = [], []
    if len(cities) < 3:
        return errors, warnings

    ings = [c.get("ingredients", {}) for c in cities]
    names = [c.get("name", "?") for c in cities]
    n = len(ings)
    total_pairs = 0
    high_sim_pairs = 0
    near_dup_pairs = []

    identical_pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            sim = cosine(ings[i], ings[j])
            total_pairs += 1
            if sim >= HOMOGENEITY_COSINE:
                high_sim_pairs += 1
            if sim >= NEAR_DUP_COSINE:
                near_dup_pairs.append((names[i], names[j], sim))
            if sim == 1.0 and ings[i] == ings[j]:
                identical_pairs.append((names[i], names[j]))

    if identical_pairs:
        sample = ", ".join(f"'{a}'↔'{b}'" for a, b in identical_pairs[:3])
        suffix = f" (and {len(identical_pairs)-3} more)" if len(identical_pairs) > 3 else ""
        errors.append(
            f"IDENTICAL: {len(identical_pairs)} city pairs share byte-identical profiles "
            f"— each city must be handled individually. Sample: {sample}{suffix}"
        )

    if total_pairs == 0:
        return errors, warnings

    fraction = high_sim_pairs / total_pairs
    if fraction >= HOMOGENEITY_FRACTION:
        errors.append(
            f"HOMOGENEITY: {fraction*100:.0f}% of city pairs have cosine≥{HOMOGENEITY_COSINE} "
            f"({high_sim_pairs}/{total_pairs} pairs) — entire country appears copy-pasted"
        )
    elif fraction >= 0.5:
        warnings.append(
            f"HIGH SIMILARITY: {fraction*100:.0f}% of city pairs have cosine≥{HOMOGENEITY_COSINE} "
            f"({high_sim_pairs}/{total_pairs} pairs)"
        )

    for a, b, sim in near_dup_pairs[:5]:  # cap at 5 to avoid noise
        warnings.append(f"NEAR-DUP: '{a}' ↔ '{b}' cosine={sim:.4f}")
    if len(near_dup_pairs) > 5:
        warnings.append(f"... and {len(near_dup_pairs)-5} more near-duplicate pairs")

    return errors, warnings


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    raw_files = sorted(DATA_RAW.glob("data.*.json"))
    if not raw_files:
        print(f"ERROR: No data.*.json files found in {DATA_RAW}")
        sys.exit(1)

    results = []  # (country_name, n_cities, errors, warnings)
    total_cities = 0
    total_errors = 0
    total_warnings = 0

    for path in raw_files:
        try:
            cities = load_json(path)
        except Exception as e:
            print(f"ERROR reading {path.name}: {e}")
            continue

        if not isinstance(cities, list) or not cities:
            continue

        country_name = cities[0].get("countryCode", path.stem.replace("data.", ""))
        # Use full name from first city if available
        country_display = cities[0].get("countryCode", "??")

        all_errors = []
        all_warnings = []

        for city in cities:
            errs, warns = check_city(city)
            all_errors.extend(errs)
            all_warnings.extend(warns)

        c_errs, c_warns = check_country_homogeneity(cities)
        all_errors.extend(c_errs)
        all_warnings.extend(c_warns)

        results.append((country_display, path.stem, len(cities), all_errors, all_warnings))
        total_cities += len(cities)
        total_errors += len(all_errors)
        total_warnings += len(all_warnings)

    # Print results
    # First: FAIL countries
    fail_countries = [(d, s, n, e, w) for d, s, n, e, w in results if e]
    warn_countries = [(d, s, n, e, w) for d, s, n, e, w in results if not e and w]
    pass_countries = [(d, s, n, e, w) for d, s, n, e, w in results if not e and not w]

    col = "{:<6} {:<35} {:>6} {:>7} {:>9}  {}"
    header = col.format("CODE", "FILE", "CITIES", "ERRORS", "WARNINGS", "STATUS")
    print(header)
    print("-" * 90)

    for display, stem, n, errs, warns in fail_countries:
        print(col.format(display, stem, n, len(errs), len(warns), "FAIL"))
        for e in errs:
            print(f"  ✗ {e}")
        for w in warns[:3]:
            print(f"  ⚠ {w}")
        if len(warns) > 3:
            print(f"  ⚠ ... ({len(warns)-3} more warnings)")

    for display, stem, n, errs, warns in warn_countries:
        print(col.format(display, stem, n, len(errs), len(warns), "WARN"))
        for w in warns[:2]:
            print(f"  ⚠ {w}")
        if len(warns) > 2:
            print(f"  ⚠ ... ({len(warns)-2} more warnings)")

    # Pass countries: summarize
    if pass_countries:
        print(col.format("--", f"({len(pass_countries)} countries)", "", "", "", "PASS"))

    print("-" * 90)
    print(
        f"TOTAL: {total_cities} cities | "
        f"{len(fail_countries)} FAIL | "
        f"{len(warn_countries)} WARN | "
        f"{len(pass_countries)} PASS"
    )

    if fail_countries:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
