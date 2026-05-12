#!/usr/bin/env python3
"""
RealMap Raw Data Cleaner
========================
Automated pass over all data/raw/data.*.json files:

  1. Apply canonical_keys.json normalization (spelling variants, plurals, synonyms)
  2. Strip entries where value == 0.44 (±tolerance) — proven AI filler value
  3. Filter ingredients to master_ingredients.json whitelist
  4. Filter cookingMethods to master_methods.json whitelist
  5. Write cleaned file in-place (original saved as .bak)
  6. Produce data/clean_report.json — per-city summary of what was removed/retained

Run: python3 clean_raw.py
     (from project root, or via Docker: python3 /app/packages/scripts/src/buildClusters/clean_raw.py)
"""

import json
import glob
import os
import sys
import shutil
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.environ.get("REALMAP_RAW_DIR", "/app/data/raw")
OUT_DIR = os.environ.get("REALMAP_OUT_DIR", "/app/data")

FILLER_VALUE = 0.44
FILLER_TOL = 0.0005  # treat [0.4395, 0.4405] as filler


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def canonical(key: str, mapping: dict) -> str:
    k = key.strip().lower()
    return mapping.get(k, k)


def is_filler(v) -> bool:
    try:
        return abs(float(v) - FILLER_VALUE) <= FILLER_TOL
    except (TypeError, ValueError):
        return False


def clean_place(place: dict, ing_map: dict, met_map: dict,
                master_ing: set, master_met: set) -> tuple[dict, dict]:
    """
    Returns (cleaned_place, report_dict).
    """
    removed_ing = {}
    removed_met = {}
    kept_ing = {}
    kept_met = {}

    # ── Ingredients ──
    for raw_k, v in (place.get("ingredients") or {}).items():
        if not isinstance(v, (int, float)) or v <= 0:
            removed_ing[raw_k] = f"non-positive value ({v})"
            continue
        if is_filler(v):
            removed_ing[raw_k] = f"filler ({v})"
            continue
        c = canonical(raw_k, ing_map)
        if c not in master_ing:
            removed_ing[raw_k] = f"not in master (canonical: {c})"
            continue
        # Take max if canonical collision
        if c in kept_ing:
            kept_ing[c] = max(kept_ing[c], float(v))
        else:
            kept_ing[c] = float(v)

    # ── Cooking Methods ──
    for raw_k, v in (place.get("cookingMethods") or {}).items():
        if not isinstance(v, (int, float)) or v <= 0:
            removed_met[raw_k] = f"non-positive value ({v})"
            continue
        if is_filler(v):
            removed_met[raw_k] = f"filler ({v})"
            continue
        c = canonical(raw_k, met_map)
        if c not in master_met:
            removed_met[raw_k] = f"not in master (canonical: {c})"
            continue
        if c in kept_met:
            kept_met[c] = max(kept_met[c], float(v))
        else:
            kept_met[c] = float(v)

    # Sort by value descending for readability
    kept_ing = dict(sorted(kept_ing.items(), key=lambda x: -x[1]))
    kept_met = dict(sorted(kept_met.items(), key=lambda x: -x[1]))

    cleaned = {k: v for k, v in place.items()
               if k not in ("ingredients", "cookingMethods")}
    cleaned["ingredients"] = kept_ing
    cleaned["cookingMethods"] = kept_met

    report = {
        "kept_ingredients": len(kept_ing),
        "kept_methods": len(kept_met),
        "removed_ingredients": removed_ing,
        "removed_methods": removed_met,
    }
    return cleaned, report


def main():
    # Load reference data
    canonical_path = os.path.join(HERE, "canonical_keys.json")
    master_ing_path = os.path.join(HERE, "master_ingredients.json")
    master_met_path = os.path.join(HERE, "master_methods.json")

    canonical_data = load_json(canonical_path)
    ing_map: dict = canonical_data.get("ingredients", {})
    met_map: dict = canonical_data.get("cookingMethods", {})

    master_ing: set = set(load_json(master_ing_path))
    master_met: set = set(load_json(master_met_path))

    print(f"Master: {len(master_ing)} ingredient keys, {len(master_met)} method keys")
    print(f"Canonical maps: {len(ing_map)} ingredient aliases, {len(met_map)} method aliases")

    # Process files alphabetically
    pattern = os.path.join(RAW_DIR, "data.*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"ERROR: no data.*.json found in {RAW_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"\nProcessing {len(files)} files from {RAW_DIR}...\n")

    report_all = {}
    total_cities = 0
    total_removed_ing = 0
    total_removed_met = 0
    empty_after_clean = []

    for fp in files:
        fname = os.path.basename(fp)
        country = fname.replace("data.", "").replace(".json", "")

        raw = load_json(fp)
        places = raw if isinstance(raw, list) else [raw]

        cleaned_places = []
        file_report = []

        for place in places:
            cleaned, rep = clean_place(place, ing_map, met_map, master_ing, master_met)
            cleaned_places.append(cleaned)
            file_report.append({
                "name": place.get("name", "?"),
                **rep,
            })
            total_removed_ing += len(rep["removed_ingredients"])
            total_removed_met += len(rep["removed_methods"])
            if rep["kept_ingredients"] == 0:
                empty_after_clean.append(f"{country}/{place.get('name', '?')}")

        total_cities += len(places)

        # Backup original
        bak_path = fp + ".bak"
        if not os.path.exists(bak_path):
            shutil.copy2(fp, bak_path)

        # Write cleaned
        output = cleaned_places if isinstance(raw, list) else cleaned_places[0]
        save_json(fp, output)

        kept = sum(r["kept_ingredients"] for r in file_report)
        removed = sum(len(r["removed_ingredients"]) for r in file_report)
        print(f"  {country:<40}  {len(places):3d} cities  "
              f"kept {kept:4d} ing  removed {removed:4d} ing")

        report_all[country] = file_report

    # Write report
    os.makedirs(OUT_DIR, exist_ok=True)
    report_path = os.path.join(OUT_DIR, "clean_report.json")
    save_json(report_path, {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files_processed": len(files),
        "total_cities": total_cities,
        "total_ingredient_entries_removed": total_removed_ing,
        "total_method_entries_removed": total_removed_met,
        "cities_with_zero_ingredients_after_clean": empty_after_clean,
        "per_file": report_all,
    })

    print(f"\n{'='*60}")
    print(f"Done. {total_cities} cities across {len(files)} files.")
    print(f"  Removed {total_removed_ing} ingredient entries (filler/non-canonical)")
    print(f"  Removed {total_removed_met} method entries (dish names/non-canonical)")
    if empty_after_clean:
        print(f"  WARNING: {len(empty_after_clean)} cities have 0 ingredients after clean")
        print(f"    — these need manual data entry in the knowledge review pass")
    print(f"  Report: {report_path}")
    print(f"  Backups: *.json.bak alongside each original")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
