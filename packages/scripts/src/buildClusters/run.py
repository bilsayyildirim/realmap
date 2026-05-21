#!/usr/bin/env python3
"""
RealMap Embedding Pipeline v2.0
================================
Loads raw city cuisine JSON files, builds clean canonical feature vectors,
runs UMAP to produce 12D embeddings, computes color calibration, and writes
features.json + global_color_calibration.json.

No clustering, no quality gates, no fallbacks. Just: data → embedding → color.

Color method: dedicated 2D UMAP for color (separate from 12D structural UMAP).
  - Both UMAPs use IDF-weighted 289D ingredient features, cosine metric.
  - 12D UMAP (n_neighbors=20, min_dist=0.05): structural embedding for similarity search.
  - 2D UMAP (n_neighbors=40, min_dist=0.10): color assignment only.
    Wider neighborhood + looser packing spread within-region clusters (Italy, Turkey, India)
    so each city gets a distinct hue from its culinary neighborhood, not just its country.
  - PCA(3) on 12D → PC3 (w-axis) → Lightness [0.54, 0.82] (orthogonal to hue plane).
  - hue2d = [x, y] normalized 2D color UMAP position per city
  - angle = atan2(y, x) + π → histogram-equalized → Hue
  - |PC3| → Chroma [0.12, 0.38]
"""

import json
import math
import os
import glob
import hashlib
import datetime
import sys

import numpy as np
from sklearn.decomposition import PCA

try:
    import umap
except ImportError:
    print("ERROR: umap-learn is not installed.")
    print("Install with: pip install umap-learn")
    print("Or in Docker: pip3 install --break-system-packages umap-learn")
    sys.exit(1)

# ── Configuration ────────────────────────────────────────────────────────────

RAW_DIR = os.environ.get("REALMAP_RAW_DIR", "/app/data/raw")
OUT_DIR = os.environ.get("REALMAP_OUT_DIR", "/app/data")
CANONICAL_KEYS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "canonical_keys.json")

# UMAP: calibrated for ~5k cities on culinary composition vectors.
# n_neighbors=20: focuses on LOCAL food-culture identity. √N (~71) was too high —
# it forced global averaging that collapsed distinct cuisines (e.g. Tokyo ≈ Istanbul).
# min_dist=0.05: tighter clusters → more empty space between food cultures → better hue separation.
UMAP_N_COMPONENTS = 12
UMAP_METRIC = "cosine"
UMAP_N_NEIGHBORS = 20
UMAP_MIN_DIST = 0.05
UMAP_RANDOM_STATE = 42

# 3D color UMAP — separate run for visual color assignment.
# Uses 3 components so the spherical coordinate hue formula (azimuth + elevation)
# can exploit all three dimensions, eliminating same-azimuth color collisions.
# n_neighbors=15: tight local neighborhood preserves cross-cultural structure.
# min_dist=0.10: spread within clusters, good global layout.
# Seed 51 is fixed for reproducibility — not tuned for specific city pairs.
COLOR_UMAP_N_NEIGHBORS = 15
COLOR_UMAP_MIN_DIST = 0.10
COLOR_UMAP_RANDOM_STATE = 51


# Minimum number of cities a feature must appear in to be included.
# 5 keeps even culturally-specific features (sumac, truffle, preserved_lemon, maple_syrup).
MIN_CITY_COUNT = 5


# ── Canonical key normalization ──────────────────────────────────────────────

def load_canonical_keys() -> tuple[dict, dict]:
    """Load the canonical_keys.json spelling-normalization map."""
    with open(CANONICAL_KEYS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("ingredients", {}), data.get("cookingMethods", {})


def canonical(key: str, mapping: dict) -> str:
    """Strip whitespace, lowercase, apply canonical mapping."""
    k = key.strip().lower()
    return mapping.get(k, k)


# ── Raw data loading ─────────────────────────────────────────────────────────

def load_raw_places(raw_dir: str) -> list[dict]:
    """
    Load all place records from data/raw/data.*.json files and deduplicate.

    Deduplication key: (name, countryCode). When the same city appears in multiple
    files or multiple times within a file, keep the entry with the richest ingredient
    data (most non-zero ingredient entries). This is fully data-driven — no manual
    priority list, just keep the most complete city profile.
    """
    pattern = os.path.join(raw_dir, "data.*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"ERROR: No data.*.json files found in {raw_dir}", file=sys.stderr)
        sys.exit(1)

    raw_places: list[dict] = []
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                raw_places.extend(data)
            elif isinstance(data, dict):
                raw_places.append(data)
        except (json.JSONDecodeError, IOError) as e:
            print(f"  Warning: skipping {os.path.basename(fp)}: {e}", file=sys.stderr)

    print(f"  Loaded {len(raw_places)} raw records from {len(files)} files")

    # Deduplicate: for each (name, countryCode) keep richest entry (most ingredients).
    seen: dict[tuple[str, str], dict] = {}
    for p in raw_places:
        name = (p.get("name") or "").strip()
        cc = (p.get("countryCode") or "").strip()
        if not name:
            continue
        key = (name, cc)
        n_ing = sum(1 for v in (p.get("ingredients") or {}).values() if isinstance(v, (int, float)) and v > 0)
        prev = seen.get(key)
        if prev is None:
            seen[key] = p
        else:
            prev_n = sum(1 for v in (prev.get("ingredients") or {}).values() if isinstance(v, (int, float)) and v > 0)
            if n_ing > prev_n:
                seen[key] = p

    places = list(seen.values())
    n_removed = len(raw_places) - len(places)
    print(f"  After deduplication: {len(places)} unique cities ({n_removed} duplicates removed)")
    return places


# ── Feature matrix construction ──────────────────────────────────────────────

def build_feature_matrix(
    places: list[dict],
    ing_map: dict,
    met_map: dict,
) -> tuple[np.ndarray, list[str], list[int]]:
    """
    Two-pass approach:
      Pass 1: collect canonical key frequencies across all cities.
      Pass 2: build N×M matrix (only features that appear in >= MIN_CITY_COUNT cities).

    Returns:
      feature_matrix  — shape [n_valid, n_features], L1-normalized rows
      feature_names   — list of "ing:key" or "met:key" strings
      valid_indices   — indices into `places` for cities with data
    """
    n = len(places)

    # ── Pass 1: frequency counting ──
    ing_freq: dict[str, int] = {}
    met_freq: dict[str, int] = {}

    for p in places:
        seen_ing: set[str] = set()
        for k, v in (p.get("ingredients") or {}).items():
            if isinstance(v, (int, float)) and v > 0:
                c = canonical(k, ing_map)
                if c not in seen_ing:
                    ing_freq[c] = ing_freq.get(c, 0) + 1
                    seen_ing.add(c)

        seen_met: set[str] = set()
        for k, v in (p.get("cookingMethods") or {}).items():
            if isinstance(v, (int, float)) and v > 0:
                c = canonical(k, met_map)
                if c not in seen_met:
                    met_freq[c] = met_freq.get(c, 0) + 1
                    seen_met.add(c)

    # Filter to features meeting the frequency threshold
    ing_keys = sorted(k for k, cnt in ing_freq.items() if cnt >= MIN_CITY_COUNT)
    met_keys = sorted(k for k, cnt in met_freq.items() if cnt >= MIN_CITY_COUNT)

    feature_names = [f"ing:{k}" for k in ing_keys] + [f"met:{k}" for k in met_keys]
    m = len(feature_names)
    ing_idx = {k: i for i, k in enumerate(ing_keys)}
    met_offset = len(ing_keys)
    met_idx = {k: i for i, k in enumerate(met_keys)}

    print(f"  Feature space: {len(ing_keys)} ingredients + {len(met_keys)} methods = {m} features")
    print(f"  (keeping features present in >= {MIN_CITY_COUNT} cities)")

    # ── Pass 2: build matrix ──
    # For duplicate canonical keys in one city (e.g. "chile" and "chili" both → "chili"),
    # take the MAX value — the highest AI estimate is the best signal.
    raw_mat = np.zeros((n, m), dtype=np.float32)
    has_data = np.zeros(n, dtype=bool)

    for i, p in enumerate(places):
        # Ingredients
        ing_accum: dict[str, float] = {}
        for k, v in (p.get("ingredients") or {}).items():
            if isinstance(v, (int, float)) and v > 0:
                c = canonical(k, ing_map)
                if c in ing_idx:
                    if c not in ing_accum or float(v) > ing_accum[c]:
                        ing_accum[c] = float(v)

        for c, val in ing_accum.items():
            raw_mat[i, ing_idx[c]] = val
            has_data[i] = True

        # Cooking methods
        met_accum: dict[str, float] = {}
        for k, v in (p.get("cookingMethods") or {}).items():
            if isinstance(v, (int, float)) and v > 0:
                c = canonical(k, met_map)
                if c in met_idx:
                    if c not in met_accum or float(v) > met_accum[c]:
                        met_accum[c] = float(v)

        for c, val in met_accum.items():
            raw_mat[i, met_offset + met_idx[c]] = val
            has_data[i] = True

    valid_indices = list(np.where(has_data)[0])
    mat = raw_mat[valid_indices]

    # L1-normalize each row: each city's vector sums to 1.
    # This removes bias from cities with more or fewer ingredient entries.
    row_sums = mat.sum(axis=1, keepdims=True)
    row_sums = np.where(row_sums == 0, 1.0, row_sums)
    mat = mat / row_sums

    print(f"  Valid places with feature data: {len(valid_indices)} / {n}")
    return mat, feature_names, valid_indices


# ── UMAP embedding ───────────────────────────────────────────────────────────

def run_umap(feature_matrix: np.ndarray) -> np.ndarray:
    """
    Run UMAP dimensionality reduction to 12D.

    n_neighbors=20: local structure preserves per-city food culture identity.
    min_dist=0.05: tighter clusters → more empty space between food cultures.
    """
    n = feature_matrix.shape[0]
    n_neighbors = UMAP_N_NEIGHBORS

    print(f"  UMAP params: n={n}, n_neighbors={n_neighbors}, "
          f"min_dist={UMAP_MIN_DIST}, metric={UMAP_METRIC}, "
          f"n_components={UMAP_N_COMPONENTS}")

    reducer = umap.UMAP(
        n_components=UMAP_N_COMPONENTS,
        metric=UMAP_METRIC,
        n_neighbors=n_neighbors,
        min_dist=UMAP_MIN_DIST,
        random_state=UMAP_RANDOM_STATE,
        init="random",
        n_jobs=1,
        low_memory=False,
        verbose=False,
    )
    embedding = reducer.fit_transform(feature_matrix)
    print(f"  Embedding shape: {embedding.shape}")
    return embedding.astype(np.float64)


def run_umap_color(feature_matrix: np.ndarray) -> np.ndarray:
    """
    Compute 3D color embedding via cosine KernelPCA.

    Each city is treated independently — its 3D coordinates are determined
    by its pairwise cosine similarity to ALL other cities globally, not by
    its country/cluster membership.

    Why not plain PCA? Standard PCA's principal axes are dominated by
    high-variance global signals (country-level patterns). Within a country
    like Turkey or India, all cities get squeezed into a small angular band
    even when their actual cuisines differ dramatically (e.g. İzmir↔Bursa
    raw cosine 0.29 but PCA placed them only 6° apart on the color wheel).

    KernelPCA with cosine kernel is mathematically equivalent to metric MDS
    on the cosine distance matrix: the 3D output minimizes |x_i - x_j|² −
    cosine_dist(i,j)² stress, so pairwise color distance is proportional to
    pairwise culinary distance. Two cities with raw cosine 0.99 land close;
    two with raw cosine 0.29 land far. No cluster bias.
    """
    from sklearn.decomposition import KernelPCA
    kpca = KernelPCA(n_components=3, kernel='cosine')
    result = kpca.fit_transform(feature_matrix)
    # Print explained variance via eigenvalues
    eigvals = kpca.eigenvalues_[:3]
    total = float(kpca.eigenvalues_.sum()) if len(kpca.eigenvalues_) else 1.0
    print(f"  Color KernelPCA(cosine): top 3 eigvals "
          f"[{eigvals[0]:.1f}, {eigvals[1]:.1f}, {eigvals[2]:.1f}] "
          f"= {(eigvals.sum() / total * 100):.1f}% of variance")
    return result.astype(np.float64)




# ── Color calibration ────────────────────────────────────────────────────────

def compute_color_calibration(
    embedding: np.ndarray,
    color_embedding_3d: np.ndarray | None = None,
) -> tuple[dict, np.ndarray]:
    """
    Compute color coordinates and global_color_calibration.json.

    Returns: (calibration_dict, hue3d_array [n,3])

    Hue is derived from spherical coordinates of the 3D color UMAP:
      azimuth  = atan2(y, x) + π          — longitude in 3D space [0, 2π]
      elevation = atan2(z, sqrt(x²+y²))   — latitude in 3D space [-π/2, π/2]
      raw_hue  = (azimuth + elevation) % 2π

    This is the Lambert cylindrical equal-area projection from sphere to circle:
    cities at the same 2D angle but different depth land at different hue angles.
    Equal weight (k=1) to both coordinates; equalization ensures uniform spread.

    Steps:
      1. PCA(3) on whitened 12D → B, mu, sigma for client-side w computation
      2. hue3d from 3D color UMAP normalized to unit sphere; spherical hue CDF
      3. 512-point angle/radius/axis CDFs for histogram-equalized H, C, L
      4. MD5 hash for cache-busting
    """
    n, d = embedding.shape
    assert d == UMAP_N_COMPONENTS, f"Expected {UMAP_N_COMPONENTS}D embedding, got {d}D"

    mu = embedding.mean(axis=0)
    sigma = embedding.std(axis=0)
    sigma = np.maximum(sigma, 1e-8)
    whitened = (embedding - mu) / sigma

    pca = PCA(n_components=3, random_state=UMAP_RANDOM_STATE)
    projected = pca.fit_transform(whitened)  # [n, 3]
    B = pca.components_  # [3, 12]

    u_vals = projected[:, 0]
    v_vals = projected[:, 1]
    w_vals = projected[:, 2]

    def _quantiles(vals: np.ndarray) -> dict:
        return {
            "p02": float(np.percentile(vals, 2)),
            "p25": float(np.percentile(vals, 25)),
            "p50": float(np.percentile(vals, 50)),
            "p75": float(np.percentile(vals, 75)),
            "p98": float(np.percentile(vals, 98)),
        }

    quantiles = {
        "u": _quantiles(u_vals),
        "v": _quantiles(v_vals),
        "w": _quantiles(w_vals),
    }

    # hue3d: 3D color UMAP normalized to unit sphere, or PCA(2) fallback.
    # Center each dim at median, scale by 98th-percentile 3D radius → unit sphere.
    if color_embedding_3d is not None:
        assert color_embedding_3d.shape[0] == n and color_embedding_3d.shape[1] == 3, \
            f"color_embedding_3d must be [{n}, 3], got {color_embedding_3d.shape}"
        cx = color_embedding_3d[:, 0] - float(np.median(color_embedding_3d[:, 0]))
        cy = color_embedding_3d[:, 1] - float(np.median(color_embedding_3d[:, 1]))
        cz = color_embedding_3d[:, 2] - float(np.median(color_embedding_3d[:, 2]))
        print(f"  Using dedicated 3D color UMAP for hue (spherical projection).")
    else:
        cx = u_vals - float(np.median(u_vals))
        cy = v_vals - float(np.median(v_vals))
        cz = w_vals - float(np.median(w_vals))
        print(f"  Using PCA(3) fallback for hue.")

    # Normalize to unit sphere using 98th-percentile 3D radius
    radii_3d = np.sqrt(cx ** 2 + cy ** 2 + cz ** 2)
    scale_3d = max(float(np.percentile(radii_3d, 98)), 1e-8)
    x_n = (cx / scale_3d).astype(np.float64)
    y_n = (cy / scale_3d).astype(np.float64)
    z_n = (cz / scale_3d).astype(np.float64)
    hue2d = np.stack([x_n, y_n, z_n], axis=1)  # stored as hue2d for backward compat

    # H: pure azimuth of 3D color UMAP — the longitude on the culinary sphere.
    # Elevation is NOT mixed into H (that caused collisions: az=π/2,el=π/2 ≡ az=π,el=0).
    # Instead, elevation goes to L (orthogonal to H by spherical geometry).
    azimuth = np.arctan2(y_n, x_n) + math.pi              # [0, 2π]
    elevation = np.arctan2(z_n, np.sqrt(x_n ** 2 + y_n ** 2))  # [-π/2, π/2]
    raw_angles = azimuth                                   # pure direction, no mixing

    angles_sorted = np.sort(raw_angles)
    N_BUCKETS = 512
    angle_percentiles = [
        float(angles_sorted[min(int(i * (n - 1) / (N_BUCKETS - 1)), n - 1)])
        for i in range(N_BUCKETS)
    ]

    # 512-point radius CDF — kept for backward compatibility (unused by main color path).
    hue2d_radii = np.sqrt(x_n ** 2 + y_n ** 2)
    radii_sorted = np.sort(hue2d_radii)
    radius_percentiles = [
        float(radii_sorted[min(int(i * (n - 1) / (N_BUCKETS - 1)), n - 1)])
        for i in range(N_BUCKETS)
    ]

    def _make_axis_cdf(arr_sorted: np.ndarray, n_bins: int = N_BUCKETS) -> list[float]:
        n_pts = len(arr_sorted)
        return [float(arr_sorted[min(int(i * (n_pts - 1) / (n_bins - 1)), n_pts - 1)])
                for i in range(n_bins)]

    # wNorm: p50-anchored asymmetric normalisation matching client normalizeRobust
    q_w = quantiles["w"]
    p50_w, p98_w, p02_w = q_w["p50"], q_w["p98"], q_w["p02"]
    w_norms = np.where(
        w_vals >= p50_w,
        np.clip((w_vals - p50_w) / max(p98_w - p50_w, 1e-8), 0.0, 1.0),
        np.clip((w_vals - p50_w) / max(p50_w - p02_w, 1e-8), -1.0, 0.0),
    )

    # uNorm, vNorm: p50-anchored normalisation for PC1 and PC2 (still used for C/insights)
    def _norm_axis(vals, q):
        p50, p98, p02 = q["p50"], q["p98"], q["p02"]
        return np.where(
            vals >= p50,
            np.clip((vals - p50) / max(p98 - p50, 1e-8), 0.0, 1.0),
            np.clip((vals - p50) / max(p50 - p02, 1e-8), -1.0, 0.0),
        )
    u_norms = _norm_axis(u_vals, quantiles["u"])
    v_norms = _norm_axis(v_vals, quantiles["v"])

    # C: |PC3| CDF — how extreme the city is on the 3rd culinary axis (orthogonal to hue).
    # Using 12D PCA PC3 rather than 3D UMAP radius because r_xy correlates with H (r=0.51),
    # while PC3 is orthogonal to PC1-PC2 by construction → C is truly independent of H.
    w_abs_percentiles = _make_axis_cdf(np.sort(np.abs(w_norms)))

    # L: |elevation| of 3D color UMAP — the latitude on the culinary sphere.
    # Elevation ∈ [-π/2, π/2] is geometrically orthogonal to azimuth (H) by construction.
    # Cities far from the equatorial plane of the 3D UMAP are brighter — they represent
    # cuisines that are "extreme" in the dimension orthogonal to the main hue plane.
    # |elevation| ∈ [0, π/2]: zero at equator (mid-brightness), max at poles (brightest).
    elevation_magnitudes = np.abs(elevation)
    elevation_percentiles = _make_axis_cdf(np.sort(elevation_magnitudes))

    # v5: z_n signed CDF for L channel — replaces |elevation| which folds ±z together.
    # Cities at z_n < 0 (UMAP "southern hemisphere") get L < 0.68; z_n > 0 → L > 0.68.
    z_percentiles = _make_axis_cdf(np.sort(z_n))

    # Keep uv_magnitude_percentiles for backward compat with old calibration readers
    uv_magnitudes = np.sqrt(u_norms ** 2 + v_norms ** 2)
    uv_magnitude_percentiles = _make_axis_cdf(np.sort(uv_magnitudes))

    calibration = {
        "version": "5",
        "mu": mu.tolist(),
        "sigma": sigma.tolist(),
        "B": B.tolist(),
        "quantiles": quantiles,
        "angle_percentiles": angle_percentiles,            # H: azimuth-only CDF (unchanged)
        "radius_percentiles": radius_percentiles,          # C: r_xy CDF — 2D UMAP radius, same space as H
        "z_percentiles": z_percentiles,                    # L: signed z_n CDF — full lightness range
        "w_abs_percentiles": w_abs_percentiles,            # kept for v4 fallback
        "elevation_percentiles": elevation_percentiles,    # kept for v4 fallback
        "uv_magnitude_percentiles": uv_magnitude_percentiles,  # kept for v3 compat
    }

    hash_src = json.dumps(calibration, sort_keys=True, separators=(",", ":"))
    calibration["hash"] = hashlib.md5(hash_src.encode()).hexdigest()[:12]

    return calibration, hue2d


# ── Feature reporting ────────────────────────────────────────────────────────

def top_canonical_features(feature_names: list[str], mat: np.ndarray, top_n: int = 20) -> None:
    """Print the highest-variance features — sanity check that signal is preserved."""
    variances = mat.var(axis=0)
    top_idx = np.argsort(variances)[::-1][:top_n]
    print(f"  Top {top_n} highest-variance features:")
    for idx in top_idx:
        print(f"    {feature_names[idx]:<40} var={variances[idx]:.5f}")


# ── Output generation ────────────────────────────────────────────────────────

def build_canonical_place(place: dict, embedding: np.ndarray, hue2d: list, ing_map: dict, met_map: dict) -> dict:
    """
    Build a clean place record for features.json.
    hue2d: [uNorm, vNorm] — PCA-normalized coordinates (deterministic).
    Client: angle=atan2(vNorm,uNorm)+π→Hue, radius=sqrt(uNorm²+vNorm²)→Chroma.
    """
    # Canonical ingredients: aggregate raw values by canonical key (use max)
    canonical_ing: dict[str, float] = {}
    for k, v in (place.get("ingredients") or {}).items():
        if isinstance(v, (int, float)) and v > 0:
            c = canonical(k, ing_map)
            if c not in canonical_ing or float(v) > canonical_ing[c]:
                canonical_ing[c] = float(v)

    canonical_met: dict[str, float] = {}
    for k, v in (place.get("cookingMethods") or {}).items():
        if isinstance(v, (int, float)) and v > 0:
            c = canonical(k, met_map)
            if c not in canonical_met or float(v) > canonical_met[c]:
                canonical_met[c] = float(v)

    # Sort by value descending for readability in popups
    canonical_ing = dict(sorted(canonical_ing.items(), key=lambda x: -x[1]))
    canonical_met = dict(sorted(canonical_met.items(), key=lambda x: -x[1]))

    record: dict = {}

    # Preserve all original metadata fields
    for field in ("id", "name", "type", "continent", "countryCode",
                  "latitude", "longitude", "region", "population", "timeZone"):
        if field in place:
            record[field] = place[field]

    record["ingredients"] = canonical_ing
    record["cookingMethods"] = canonical_met
    record["embedding"] = [float(x) for x in embedding]
    record["hue2d"] = hue2d  # [uNorm, vNorm] from PCA — deterministic color coords

    return record


def write_features_json(
    places: list[dict],
    valid_indices: list[int],
    embeddings: np.ndarray,
    hue2d_arr: np.ndarray,
    ing_map: dict,
    met_map: dict,
    out_dir: str,
) -> int:
    """Write features.json."""
    output = []
    for i, orig_idx in enumerate(valid_indices):
        hue2d = [float(hue2d_arr[i, 0]), float(hue2d_arr[i, 1]), float(hue2d_arr[i, 2])]
        record = build_canonical_place(places[orig_idx], embeddings[i], hue2d, ing_map, met_map)
        output.append(record)

    out_path = os.path.join(out_dir, "features.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"  Wrote features.json: {len(output)} cities, {size_mb:.1f} MB")
    return len(output)


def write_calibration_json(calibration: dict, out_dir: str) -> None:
    """Write global_color_calibration.json and features_meta.json."""
    out_path = os.path.join(out_dir, "global_color_calibration.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(calibration, f, separators=(",", ":"))
    print(f"  Wrote global_color_calibration.json (hash: {calibration['hash']})")

    # features_meta.json — stores calibration hash for client-side validation
    meta_path = os.path.join(out_dir, "features_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"calibrationHash": calibration["hash"]}, f, separators=(",", ":"))
    print(f"  Wrote features_meta.json")


def write_build_report(
    n_cities: int,
    n_features: int,
    feature_names: list[str],
    n_ing: int,
    n_met: int,
    duration_s: float,
    out_dir: str,
) -> None:
    """Write build_report.json with run metadata."""
    report = {
        "version": "2",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z",
        "pipeline": "umap-embedding-v2",
        "cities": n_cities,
        "features": n_features,
        "ingredientFeatures": n_ing,
        "methodFeatures": n_met,
        "embeddingDimensions": UMAP_N_COMPONENTS,
        "umapParams": {
            "metric": UMAP_METRIC,
            "minDist": UMAP_MIN_DIST,
            "nNeighbors": max(15, int(math.sqrt(n_cities))),
            "randomState": UMAP_RANDOM_STATE,
        },
        "minCityCount": MIN_CITY_COUNT,
        "durationSeconds": round(duration_s, 1),
    }
    out_path = os.path.join(out_dir, "build_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"  Wrote build_report.json ({duration_s:.0f}s)")


def _write_object_schema(f, schema_name: str, type_name: str, keys: list[str]) -> None:
    f.write("import { Type } from '@sinclair/typebox';\n")
    f.write("import type { Static } from '@sinclair/typebox';\n\n")
    f.write("// Generated by RealMap embedding pipeline — do not edit manually\n")
    f.write(f"export const {schema_name} = Type.Object({{\n")
    for key in sorted(keys):
        escaped = key.replace('"', '\\"')
        f.write(f'  "{escaped}": Type.Optional(Type.Number()),\n')
    f.write("});\n\n")
    f.write(f"export type {type_name} = Static<typeof {schema_name}>;\n")


def write_ts_schemas(
    ing_keys: list[str],
    met_keys: list[str],
    out_dir: str,
) -> None:
    """
    Generate TypeScript type schema files for the shared package.
    Uses Type.Object with all canonical keys so .properties is available at runtime
    and keyof gives the exact string union for type safety.
    """
    ing_path = os.path.join(out_dir, "IngredientsSchema.ts")
    with open(ing_path, "w", encoding="utf-8") as f:
        _write_object_schema(f, "IngredientsSchema", "Ingredients", ing_keys)

    met_path = os.path.join(out_dir, "CookingMethodsSchema.ts")
    with open(met_path, "w", encoding="utf-8") as f:
        _write_object_schema(f, "CookingMethodsSchema", "CookingMethods", met_keys)

    print(f"  Wrote IngredientsSchema.ts ({len(ing_keys)} canonical ingredient keys)")
    print(f"  Wrote CookingMethodsSchema.ts ({len(met_keys)} canonical method keys)")


# ── Color helpers for Discover dashboard insights ─────────────────────────────

def _equalize_angle_interp(raw_angle: float, percentiles: list) -> float:
    """Binary search + linear interpolation (mirrors equalizeAngle in colorUtils.ts)."""
    n = len(percentiles)
    lo, hi = 0, n - 1
    while lo < hi:
        mid = (lo + hi) >> 1
        if percentiles[mid] < raw_angle:
            lo = mid + 1
        else:
            hi = mid
    if 0 < lo < n:
        lo_val = percentiles[lo - 1]
        hi_val = percentiles[lo]
        t = (raw_angle - lo_val) / (hi_val - lo_val) if hi_val > lo_val else 0.0
        return ((lo - 1 + t) / (n - 1)) * 2 * math.pi
    return (lo / (n - 1)) * 2 * math.pi


def _equalize_radius_interp(raw_radius: float, percentiles: list) -> float:
    """Map raw radius to uniform [0,1] rank using CDF (mirrors equalizeRadius in colorUtils.ts)."""
    n = len(percentiles)
    lo, hi = 0, n - 1
    while lo < hi:
        mid = (lo + hi) >> 1
        if percentiles[mid] < raw_radius:
            lo = mid + 1
        else:
            hi = mid
    if 0 < lo < n:
        lo_val = percentiles[lo - 1]
        hi_val = percentiles[lo]
        t = (raw_radius - lo_val) / (hi_val - lo_val) if hi_val > lo_val else 0.0
        return (lo - 1 + t) / (n - 1)
    return lo / (n - 1)


def _oklch_to_linear_rgb(L: float, C: float, H_rad: float) -> tuple[float, float, float]:
    """OKLCH → linear sRGB (no gamma, no clamping)."""
    a_ok = C * math.cos(H_rad)
    b_ok = C * math.sin(H_rad)
    l_ = L + 0.3963377774 * a_ok + 0.2158037573 * b_ok
    m_ = L - 0.1055613458 * a_ok - 0.0638541728 * b_ok
    s_ = L - 0.0894841775 * a_ok - 1.2914855480 * b_ok
    l3 = l_ ** 3; m3 = m_ ** 3; s3 = s_ ** 3
    r =  4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
    g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
    b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
    return r, g, b


def _oklch_to_hex(L: float, C: float, H_deg: float) -> str:
    """OKLCH → sRGB hex with binary-search gamut compression matching colorUtils.ts tier-1.
    Preserves hue and lightness; compresses chroma until all channels are in [0, 1].
    This ensures hex_grid.json colors are identical to what the JS client renders."""
    H = math.radians(H_deg)

    def _in_gamut(r: float, g: float, b: float) -> bool:
        eps = 5e-4
        return -eps <= r <= 1 + eps and -eps <= g <= 1 + eps and -eps <= b <= 1 + eps

    def _srgb_byte(x: float) -> int:
        x = max(0.0, min(1.0, x))
        c = 12.92 * x if x <= 0.0031308 else 1.055 * (x ** (1 / 2.4)) - 0.055
        return round(c * 255)

    r_lin, g_lin, b_lin = _oklch_to_linear_rgb(L, C, H)
    if not _in_gamut(r_lin, g_lin, b_lin):
        # Binary search: fix H and L, shrink C until in gamut (mirrors JS oklchInGamut tier-1)
        lo, hi = 0.0, C
        for _ in range(18):
            mid = (lo + hi) / 2
            r, g, b = _oklch_to_linear_rgb(L, mid, H)
            if _in_gamut(r, g, b):
                lo = mid
            else:
                hi = mid
        r_lin, g_lin, b_lin = _oklch_to_linear_rgb(L, lo, H)

    return f"#{_srgb_byte(r_lin):02x}{_srgb_byte(g_lin):02x}{_srgb_byte(b_lin):02x}"


def _city_color_from_hue2d(
    hue2d_i: np.ndarray,
    w_abs: float,
    angle_percentiles: list,
    elevation_percentiles: list | None = None,
    w_abs_percentiles: list | None = None,
    radius_percentiles: list | None = None,
    z_percentiles: list | None = None,
) -> str:
    """Compute OKLCH hex for one city. Mirrors getCityColor() in colorUtils.ts exactly.

    v5 (radius_percentiles + z_percentiles present):
      H = azimuth of 3D color UMAP → histogram-equalized → [0°, 360°]
      C = r_xy = sqrt(x²+y²) of 3D color UMAP → equalized → [0.14, 0.43]
      L = z of 3D color UMAP → equalized (signed CDF) → [0.54, 0.82]
      OKLab a = C·cos(H), b = C·sin(H): same space as H → ΔE ∝ culinary distance.

    v4 fallback (elevation_percentiles + w_abs_percentiles):
      H = azimuth, C = |PC3|, L = |elevation|
    """
    x = float(hue2d_i[0])
    y = float(hue2d_i[1])
    z = float(hue2d_i[2]) if len(hue2d_i) >= 3 else 0.0
    azimuth = math.atan2(y, x) + math.pi

    # H: pure azimuth (unchanged across versions)
    eq_angle = _equalize_angle_interp(azimuth, angle_percentiles)
    H_deg = (eq_angle * 180 / math.pi) % 360

    # C: v5 = r_xy from same 3D UMAP space as H; v4 = |PC3| from separate 12D PCA
    if radius_percentiles is not None:
        r_xy = math.sqrt(x * x + y * y)
        chroma_rank = _equalize_radius_interp(r_xy, radius_percentiles)
    elif w_abs_percentiles is not None:
        chroma_rank = _equalize_radius_interp(w_abs, w_abs_percentiles)
    else:
        chroma_rank = w_abs
    C = max(0.10, min(0.46, 0.10 + 0.36 * chroma_rank))

    # L: v5 = signed z equalization (full range); v4 = |elevation| (folded, no sign)
    if z_percentiles is not None:
        l_rank = _equalize_radius_interp(z, z_percentiles)
    elif elevation_percentiles is not None:
        el_mag = abs(math.atan2(z, math.sqrt(x * x + y * y)))
        l_rank = _equalize_radius_interp(el_mag, elevation_percentiles)
    else:
        el_mag = abs(math.atan2(z, math.sqrt(x * x + y * y)))
        l_rank = min(el_mag / (math.pi / 2), 1.0)
    L = max(0.45, min(0.90, 0.45 + 0.45 * (l_rank ** 0.55)))

    return _oklch_to_hex(L, C, H_deg)


def _compute_color_inputs(
    embedding: np.ndarray,
    calibration: dict,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute per-city color inputs from 12D embedding + calibration.
    Returns (u_norms, v_norms, w_norms, uv_magnitudes, w_abs_arr) — all shape [n].
    Mirrors normalizeRobust() in colorUtils.ts exactly.
    """
    mu = np.array(calibration["mu"])
    sigma = np.maximum(np.array(calibration["sigma"]), 1e-8)
    B = np.array(calibration["B"])
    q = calibration["quantiles"]

    proj = ((embedding - mu) / sigma) @ B.T  # [n, 3]

    def _norm(vals: np.ndarray, qx: dict) -> np.ndarray:
        p50, p98, p02 = qx["p50"], qx["p98"], qx["p02"]
        return np.clip(
            np.where(
                vals >= p50,
                (vals - p50) / max(1e-8, p98 - p50),
                (vals - p50) / max(1e-8, p50 - p02),
            ),
            -1.0, 1.0,
        )

    u_norms = _norm(proj[:, 0], q["u"])
    v_norms = _norm(proj[:, 1], q["v"])
    w_norms = _norm(proj[:, 2], q["w"])
    uv_magnitudes = np.sqrt(u_norms ** 2 + v_norms ** 2)
    w_abs_arr = np.abs(w_norms)
    return u_norms, v_norms, w_norms, uv_magnitudes, w_abs_arr


# ── Per-insight computation helpers ───────────────────────────────────────────

def _ins_farthest_twins(
    cos_sim: np.ndarray,
    lats: np.ndarray,
    lngs: np.ndarray,
    names: np.ndarray,
    colors: list,
    places_ingr: list | None = None,
) -> list:
    ii: np.ndarray = np.array([], dtype=np.int64)
    for threshold in (0.70, 0.60, 0.50):
        ii, jj = np.where(np.triu(cos_sim > threshold, k=1))
        if len(ii) > 0:
            break
    if len(ii) == 0:
        return []

    sim_vals = cos_sim[ii, jj].astype(np.float64)
    lat1 = np.radians(lats[ii])
    lat2 = np.radians(lats[jj])
    dlat = lat2 - lat1
    dlng = np.radians(lngs[jj] - lngs[ii])
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlng / 2) ** 2
    km = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))

    far = km > 10000
    if far.sum() < 3:
        far = km > 8000
    if not far.any():
        return []

    ii_f, jj_f, sim_f, km_f = ii[far], jj[far], sim_vals[far], km[far]
    results: list = []
    seen: set = set()
    for k_ord in np.argsort(-sim_f):
        i, j = int(ii_f[k_ord]), int(jj_f[k_ord])
        if i in seen or j in seen:
            continue
        twin: dict = {
            "cityA": str(names[i]), "cityB": str(names[j]),
            "km": int(round(float(km_f[k_ord]))),
            "cosine_sim": round(float(sim_f[k_ord]), 3),
            "latA": round(float(lats[i]), 4), "lngA": round(float(lngs[i]), 4),
            "latB": round(float(lats[j]), 4), "lngB": round(float(lngs[j]), 4),
            "colorA": colors[i], "colorB": colors[j],
        }
        if places_ingr is not None:
            ingr_a = places_ingr[i]
            ingr_b = places_ingr[j]
            all_keys = sorted(set(ingr_a.keys()) | set(ingr_b.keys()))
            shared = sorted(
                [(k, round(min(ingr_a.get(k, 0.0), ingr_b.get(k, 0.0)), 2))
                 for k in all_keys
                 if ingr_a.get(k, 0.0) >= 0.45 and ingr_b.get(k, 0.0) >= 0.45],
                key=lambda x: -x[1],
            )[:8]
            diff = sorted(
                [k for k in all_keys
                 if abs(ingr_a.get(k, 0.0) - ingr_b.get(k, 0.0)) >= 0.35],
                key=lambda k: -abs(ingr_a.get(k, 0.0) - ingr_b.get(k, 0.0)),
            )[:6]
            twin["shared_ingredients"] = [{"key": k, "score": s} for k, s in shared]
            twin["diff_ingredients"] = [
                {"key": k,
                 "scoreA": round(ingr_a.get(k, 0.0), 2),
                 "scoreB": round(ingr_b.get(k, 0.0), 2)}
                for k in diff
            ]
        results.append(twin)
        seen.update([i, j])
        if len(results) >= 5:
            break
    return results


def _ins_lonely_cuisines(
    cos_sim: np.ndarray, names: np.ndarray, continents: np.ndarray, colors: list
) -> list:
    K = 10
    np.fill_diagonal(cos_sim, -1.0)
    avg_sim = np.partition(cos_sim, -K, axis=1)[:, -K:].mean(axis=1)
    np.fill_diagonal(cos_sim, 1.0)

    order = np.argsort(avg_sim)
    results: list = []
    seen_cont: set = set()
    for idx in order:
        if len(results) >= 5:
            break
        cont = str(continents[idx])
        if cont in seen_cont:
            continue
        results.append({
            "city": str(names[idx]),
            "avg_neighbor_similarity": round(float(avg_sim[idx]), 3),
            "continent": cont,
            "color": colors[idx],
        })
        seen_cont.add(cont)

    if len(results) < 5:
        done = {r["city"] for r in results}
        for idx in order:
            if len(results) >= 5:
                break
            city = str(names[idx])
            if city not in done:
                results.append({
                    "city": city,
                    "avg_neighbor_similarity": round(float(avg_sim[idx]), 3),
                    "continent": str(continents[idx]),
                    "color": colors[idx],
                })
                done.add(city)
    return results[:5]


def _ins_crossroads(
    cos_sim: np.ndarray, names: np.ndarray, continents: np.ndarray, colors: list
) -> list:
    K = 10
    np.fill_diagonal(cos_sim, -1.0)
    top_k_idx = np.argpartition(-cos_sim, K, axis=1)[:, :K]
    np.fill_diagonal(cos_sim, 1.0)

    n_cont = np.array([
        len({str(continents[int(j)]) for j in top_k_idx[i]})
        for i in range(len(names))
    ])
    results: list = []
    seen: set = set()
    for idx in np.argsort(-n_cont):
        if len(results) >= 5:
            break
        city = str(names[idx])
        if city in seen:
            continue
        neighbors = [str(names[int(j)]) for j in top_k_idx[idx][:5]]
        results.append({
            "city": city,
            "continents_covered": int(n_cont[idx]),
            "top_neighbors": neighbors,
            "color": colors[idx],
        })
        seen.add(city)
    return results


def _ins_diverse_countries(
    hue2d: np.ndarray, country_codes: np.ndarray, names: np.ndarray
) -> list:
    groups: dict = {}
    for i in range(len(names)):
        groups.setdefault(str(country_codes[i]), []).append(i)

    rows: list = []
    for cc, indices in groups.items():
        if len(indices) < 4:
            continue
        idx_arr = np.array(indices)
        x_c = hue2d[idx_arr, 0]; y_c = hue2d[idx_arr, 1]
        z_c = hue2d[idx_arr, 2] if hue2d.shape[1] > 2 else np.zeros(len(idx_arr))
        azim = np.arctan2(y_c, x_c) + math.pi
        elev = np.arctan2(z_c, np.sqrt(x_c**2 + y_c**2))
        angles = (azim + elev) % (2 * math.pi)
        R = max(float(np.abs(np.mean(np.exp(1j * angles)))), 1e-10)
        circ_std = math.degrees(math.sqrt(-2 * math.log(R)))
        rows.append((cc, circ_std, len(indices)))

    rows.sort(key=lambda x: -x[1])
    return [
        {"countryCode": cc, "city_count": cnt, "hue_std_deg": round(std, 1)}
        for cc, std, cnt in rows[:5]
    ]


def _ins_flavor_families(
    embedding: np.ndarray,
    hue2d: np.ndarray,
    uv_magnitudes: np.ndarray,
    w_abs_arr: np.ndarray,
    feature_matrix: np.ndarray,
    feature_names: list,
    continents: np.ndarray,
    angle_percentiles: list,
    elevation_percentiles: list | None = None,
    w_abs_percentiles: list | None = None,
    radius_percentiles: list | None = None,
    z_percentiles: list | None = None,
) -> list:
    from sklearn.cluster import KMeans
    labels = KMeans(n_clusters=8, random_state=42, n_init=10).fit_predict(embedding)

    global_mean = feature_matrix.mean(axis=0)
    ing_names = [fn[4:] for fn in feature_names if fn.startswith("ing:")]
    ing_mask = np.array([fn.startswith("ing:") for fn in feature_names])

    results: list = []
    for k_id in range(8):
        mask = labels == k_id
        if mask.sum() == 0:
            continue
        delta = feature_matrix[mask].mean(axis=0) - global_mean
        ing_delta = delta[ing_mask]
        top3 = [ing_names[i] for i in np.argsort(-ing_delta)[:3] if ing_delta[i] > 0]

        mean_h2d = hue2d[mask].mean(axis=0)
        mean_w_abs = float(w_abs_arr[mask].mean())
        color = _city_color_from_hue2d(mean_h2d, mean_w_abs, angle_percentiles, elevation_percentiles, w_abs_percentiles, radius_percentiles, z_percentiles)
        cluster_conts = sorted({str(c) for c in continents[mask] if c})

        if len(top3) >= 2:
            label = f"{top3[0].replace('_', ' ').title()} & {top3[1].replace('_', ' ').title()}"
        elif top3:
            label = top3[0].replace("_", " ").title()
        else:
            label = f"Cluster {k_id + 1}"

        results.append({
            "cluster_id": k_id,
            "label": label,
            "top_ingredients": top3,
            "city_count": int(mask.sum()),
            "continents": cluster_conts,
            "color": color,
        })

    results.sort(key=lambda x: -x["city_count"])
    return results


def build_hex_grid(
    places: list,
    valid_indices: list,
    embedding: np.ndarray,
    hue2d: np.ndarray,
    calibration: dict,
    out_dir: str,
) -> None:
    """
    Tile the entire Earth with H3 resolution-4 hexagons (~288k cells, ~22km side).
    Each cell is colored by Gaussian-blended nearest cities' OKLCH color.
    Output: hex_grid.json — loaded by the client as a permanent background fill.
    """
    try:
        import h3
    except ImportError:
        print("  ⚠  h3 not installed — skipping hex_grid.json (add h3>=4.1 to requirements.txt)")
        return

    from scipy.spatial import cKDTree

    n = len(valid_indices)
    angle_percentiles = calibration["angle_percentiles"]
    w_abs_percentiles = calibration.get("w_abs_percentiles")
    elevation_percentiles = calibration.get("elevation_percentiles")
    radius_percentiles = calibration.get("radius_percentiles")
    z_percentiles = calibration.get("z_percentiles")

    _, _, _, _, w_abs_arr = _compute_color_inputs(embedding, calibration)

    colors = [
        _city_color_from_hue2d(
            hue2d[i], float(w_abs_arr[i]),
            angle_percentiles, elevation_percentiles, w_abs_percentiles,
            radius_percentiles, z_percentiles,
        )
        for i in range(n)
    ]

    # Build 3D Cartesian KD-tree for correct spherical nearest-neighbor lookup
    city_lats = np.array([places[valid_indices[i]]["latitude"] for i in range(n)])
    city_lngs = np.array([places[valid_indices[i]]["longitude"] for i in range(n)])
    lat_r = np.radians(city_lats)
    lng_r = np.radians(city_lngs)
    city_xyz = np.column_stack([
        np.cos(lat_r) * np.cos(lng_r),
        np.cos(lat_r) * np.sin(lng_r),
        np.sin(lat_r),
    ])
    tree = cKDTree(city_xyz)

    # Resolution 4 — ~288k cells globally, ~22 km side. Correctly covers
    # Cyprus, Malta, Aegean islands, and peninsulas that resolution 3 (83 km)
    # misses. hex_grid.json grows to ~15-20 MB but compresses well over HTTP.
    RESOLUTION = 4
    all_cells = list(h3.uncompact_cells(h3.get_res0_cells(), RESOLUTION))
    print(f"  Assigning colors to {len(all_cells):,} H3 cells (resolution {RESOLUTION})...")

    R_EARTH_KM = 6371.0

    def _chord_sq(km: float) -> float:
        return (2.0 * math.sin(km / (2.0 * R_EARTH_KM))) ** 2

    # Land mask: Natural Earth 50m land polygon via shapely point-in-polygon.
    # 50m (1:50,000,000) correctly captures small Balkan countries, islands, and
    # peninsulas that the 110m version misses (causing black holes in Serbia,
    # Kosovo, Montenegro, Albania, North Macedonia, Crimea, etc.).
    use_land_mask = False
    try:
        from shapely.geometry import shape, Point, Polygon
        from shapely.ops import unary_union
        from shapely.prepared import prep
        import urllib.request

        land_cache = os.path.join(out_dir, "ne_50m_land.geojson")
        if not os.path.exists(land_cache):
            print("    Downloading Natural Earth 50m land polygon...")
            urllib.request.urlretrieve(
                "https://raw.githubusercontent.com/nvkelso/natural-earth-vector"
                "/master/geojson/ne_50m_land.geojson",
                land_cache,
            )
        with open(land_cache) as _f:
            _land_gj = json.load(_f)
        land_geom = prep(unary_union([shape(feat["geometry"]) for feat in _land_gj["features"]]))
        use_land_mask = True
        print(f"    Land mask loaded ({len(_land_gj['features'])} polygons)")
    except Exception as _e:
        print(f"    ⚠ Land mask unavailable ({type(_e).__name__}: {_e}) — falling back to city-distance gate")

    # Fallback gate (used only if shapely is unavailable).
    # Nearest city ≤ NEAREST_KM eliminates open-ocean cells that happen to have two
    # cities within 500 km on opposite sides (e.g. Labrador Sea, mid-Atlantic blobs).
    # Second city ≤ MAX_DIST_KM filters isolated single-city atolls / remote islands.
    NEAREST_KM = 200
    NEAREST_CHORD_SQ = _chord_sq(NEAREST_KM)
    MAX_DIST_KM = 500
    MAX_CHORD_SQ = _chord_sq(MAX_DIST_KM)

    # Fixed Gaussian blend sigma: 200km produces smooth, readable gradients.
    # Confirmed visually superior to auto-computed (84km = blocky) and adaptive (273km = over-blurred).
    # 200km means cities ~400km apart still have ~14% relative weight, so transitions
    # stay smooth across country-sized regions without losing all local detail.
    BLEND_SIGMA_KM = 200.0
    BLEND_SIGMA_CHORD_SQ = _chord_sq(BLEND_SIGMA_KM)
    MAX_BLEND_DIST_KM = 5000
    MAX_BLEND_CHORD_SQ = _chord_sq(MAX_BLEND_DIST_KM)
    k_blend = min(30, n)
    print(f"    Blend sigma: {BLEND_SIGMA_KM:.0f}km (fixed), k={k_blend} nearest cities")

    features = []
    skipped = 0
    for cell in all_cells:
        clat, clng = h3.cell_to_latlng(cell)

        # Land mask check first — cheapest filter, avoids KD-tree query for ocean cells.
        if use_land_mask:
            if not land_geom.contains(Point(clng, clat)):  # shapely uses (x=lng, y=lat)
                # Secondary check: small islands (Malta, Aegean, etc.) where the H3
                # centroid falls slightly offshore but the cell polygon overlaps land.
                boundary = h3.cell_to_boundary(cell)  # [(lat, lng), ...]
                hex_poly = Polygon([(lng, lat) for lat, lng in boundary])
                if not land_geom.intersects(hex_poly):
                    skipped += 1
                    continue
        else:
            # Fallback: compute KD-tree position then apply two-city coverage gate.
            r_lat = math.radians(clat)
            r_lng = math.radians(clng)
            xyz_fb = [math.cos(r_lat) * math.cos(r_lng),
                      math.cos(r_lat) * math.sin(r_lng),
                      math.sin(r_lat)]
            dists_fb, _ = tree.query(xyz_fb, k=min(2, n))
            if np.isscalar(dists_fb):
                dists_fb = [dists_fb]
            if float(dists_fb[0]) ** 2 > NEAREST_CHORD_SQ:
                skipped += 1
                continue
            if len(dists_fb) >= 2 and float(dists_fb[1]) ** 2 > MAX_CHORD_SQ:
                skipped += 1
                continue

        r_lat = math.radians(clat)
        r_lng = math.radians(clng)
        xyz = [math.cos(r_lat) * math.cos(r_lng),
               math.cos(r_lat) * math.sin(r_lng),
               math.sin(r_lat)]

        # tree.query returns chord distances (Euclidean on unit sphere), not squared.
        dists, idxs = tree.query(xyz, k=k_blend)
        if k_blend == 1:
            dists = [dists]; idxs = [idxs]

        # Collect blend candidates within MAX_BLEND_DIST_KM (generous: covers remote
        # land areas like Antarctica interior whose nearest city can be 4000+ km away).
        bd = np.array([float(dists[j]) for j in range(k_blend)])
        bi = [int(idxs[j]) for j in range(k_blend)]
        within = bd ** 2 <= MAX_BLEND_CHORD_SQ
        bd = bd[within]
        bi = [bi[j] for j in range(len(bi)) if within[j]]

        if not bi:
            skipped += 1
            continue

        if len(bi) == 1:
            color = colors[bi[0]]
        else:
            # Adaptive per-cell sigma: distance to kth nearest city × 1.5.
            # Scale factor 1.5 ensures the kth city still has ~80% relative weight.
            # Falls back to nearest-city distance if only 1 candidate passed the filter.
            raw_w = np.exp(-(bd ** 2) / (2.0 * BLEND_SIGMA_CHORD_SQ))
            total_w = raw_w.sum()
            if total_w < 1e-12:
                # All cities are extremely far away (e.g. Antarctic interior) —
                # fall back to nearest city color rather than producing NaN.
                color = colors[bi[0]]
            else:
                raw_w /= total_w

                # Spherical mean: weighted average of 3D unit vectors.
                # azimuth and elevation are both derived from blended_hue2d directly,
                # so no separate blending of uv_magnitude is needed.
                x_sum = sum(raw_w[j] * float(hue2d[i][0]) for j, i in enumerate(bi))
                y_sum = sum(raw_w[j] * float(hue2d[i][1]) for j, i in enumerate(bi))
                z_sum = sum(raw_w[j] * float(hue2d[i][2] if len(hue2d[i]) > 2 else 0.0)
                            for j, i in enumerate(bi))
                blended_hue2d = np.array([x_sum, y_sum, z_sum])

                # C: weighted mean of |PC3| magnitudes
                blended_w_abs = float(sum(raw_w[j] * float(w_abs_arr[i]) for j, i in enumerate(bi)))

                color = _city_color_from_hue2d(
                    blended_hue2d, blended_w_abs,
                    angle_percentiles, elevation_percentiles, w_abs_percentiles,
                    radius_percentiles, z_percentiles,
                )

        # Build closed polygon ring; fix antimeridian jumps
        boundary = h3.cell_to_boundary(cell)  # [(lat, lng), ...]
        ring = []
        for lat_p, lng_p in boundary:
            if ring:
                prev_lng = ring[-1][0]
                while lng_p - prev_lng > 180:
                    lng_p -= 360
                while prev_lng - lng_p > 180:
                    lng_p += 360
            ring.append([round(lng_p, 3), round(lat_p, 3)])
        ring.append(ring[0])  # close

        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"color": color},
        })

    out_path = os.path.join(out_dir, "hex_grid.json")
    with open(out_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / 1_000_000
    print(f"  ✓ hex_grid.json: {len(features):,} cells ({skipped:,} remote/ocean skipped), {size_mb:.1f} MB")


def compute_insights(
    places: list,
    valid_indices: list,
    embedding: np.ndarray,
    hue2d: np.ndarray,
    calibration: dict,
    feature_matrix: np.ndarray,
    feature_names: list,
    out_dir: str,
) -> None:
    """Compute 5 insight datasets for the Discover dashboard → insights.json."""
    n = len(valid_indices)
    names = np.empty(n, dtype=object)
    lats = np.zeros(n, dtype=np.float64)
    lngs = np.zeros(n, dtype=np.float64)
    continents = np.empty(n, dtype=object)
    country_codes = np.empty(n, dtype=object)
    for i, orig_idx in enumerate(valid_indices):
        p = places[orig_idx]
        names[i] = p.get("name", "")
        lats[i] = float(p.get("latitude") or 0)
        lngs[i] = float(p.get("longitude") or 0)
        continents[i] = p.get("continent") or ""
        country_codes[i] = p.get("countryCode") or ""

    angle_percentiles = calibration["angle_percentiles"]
    w_abs_percentiles = calibration.get("w_abs_percentiles")
    elevation_percentiles = calibration.get("elevation_percentiles")
    radius_percentiles = calibration.get("radius_percentiles")
    z_percentiles = calibration.get("z_percentiles")

    _, _, w_norms, uv_magnitudes, w_abs_arr = _compute_color_inputs(embedding, calibration)

    print("  Pre-computing city colors for insights...")
    colors = [
        _city_color_from_hue2d(
            hue2d[i], float(w_abs_arr[i]),
            angle_percentiles, elevation_percentiles, w_abs_percentiles,
            radius_percentiles, z_percentiles,
        )
        for i in range(n)
    ]

    print("  Building cosine similarity matrix (~134MB for 5800 cities)...")
    emb_f32 = embedding.astype(np.float32)
    e_norms = np.maximum(np.linalg.norm(emb_f32, axis=1, keepdims=True), 1e-8)
    emb_unit = emb_f32 / e_norms
    cos_sim = emb_unit @ emb_unit.T  # [n, n] float32

    print("    1. Farthest twins...")
    places_ingr = [
        places[orig_idx].get("ingredients", {}) for orig_idx in valid_indices
    ]
    twins = _ins_farthest_twins(cos_sim, lats, lngs, names, colors, places_ingr)
    print(f"       → {len(twins)} pairs")
    print("    2. Lonely cuisines...")
    lonely = _ins_lonely_cuisines(cos_sim, names, continents, colors)
    print("    3. Crossroads kitchens...")
    crossroads = _ins_crossroads(cos_sim, names, continents, colors)
    del cos_sim  # free ~134MB

    print("    4. Diverse countries...")
    diverse = _ins_diverse_countries(hue2d, country_codes, names)
    print("    5. Flavor families (K-means k=8)...")
    families = _ins_flavor_families(
        embedding, hue2d, uv_magnitudes, w_abs_arr, feature_matrix, feature_names,
        continents, angle_percentiles, elevation_percentiles, w_abs_percentiles,
        radius_percentiles, z_percentiles,
    )

    out_path = os.path.join(out_dir, "insights.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "farthest_twins": twins,
                "lonely_cuisines": lonely,
                "crossroads": crossroads,
                "diverse_countries": diverse,
                "flavor_families": families,
            },
            f, ensure_ascii=False, indent=2,
        )
    print(
        f"  Wrote insights.json: {len(twins)} twins, {len(lonely)} lonely, "
        f"{len(crossroads)} crossroads, {len(diverse)} countries, {len(families)} families"
    )


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    import time
    t0 = time.time()

    print("=" * 60)
    print("RealMap Embedding Pipeline v2.0")
    print(f"  Raw dir : {RAW_DIR}")
    print(f"  Out dir : {OUT_DIR}")
    print(f"  Threshold: >= {MIN_CITY_COUNT} cities per feature")
    print("=" * 60)

    # Step 1 — Canonical key mapping
    print("\n[1/7] Loading canonical key normalization...")
    ing_map, met_map = load_canonical_keys()
    print(f"  {len(ing_map)} ingredient aliases, {len(met_map)} method aliases")

    # Step 2 — Raw data
    print("\n[2/7] Loading raw places...")
    places = load_raw_places(RAW_DIR)

    # Step 3 — Feature matrix
    print("\n[3/7] Building feature matrix...")
    feature_matrix, feature_names, valid_indices = build_feature_matrix(
        places, ing_map, met_map
    )

    n_ing = sum(1 for f in feature_names if f.startswith("ing:"))
    n_met = sum(1 for f in feature_names if f.startswith("met:"))
    ing_keys = [f[4:] for f in feature_names if f.startswith("ing:")]
    met_keys = [f[4:] for f in feature_names if f.startswith("met:")]

    print("\n  Variance check (top features should be culturally informative):")
    top_canonical_features(feature_names, feature_matrix, top_n=15)

    # Step 3b — Data quality check: dimensional coverage and sparsity warnings
    print("\n[3b/7] Data quality check...")
    _STARCH_KEYS = {
        'rice','wheat','corn','potato','cassava','flatbread','teff','quinoa','millet',
        'sorghum','noodle','oat','barley','rye_bread','bulgur','couscous','injera',
        'ugali','cornmeal','bread',
    }
    _PROTEIN_KEYS = {
        'beef','pork','lamb','fish','chicken','bean','lentil','tofu','egg','chickpea',
        'mussel','shrimp','crab','duck','horse_meat','camel','pigeon','goat','tuna',
        'anchovy','herring','cod','catfish','mutton','rabbit','venison','octopus',
        'crayfish',
    }
    _FAT_KEYS = {
        'olive_oil','butter','ghee','coconut_oil','palm_oil','lard','sesame_oil',
        'sunflower_oil','coconut_milk','cream','mustard_oil','chili_oil',
        'coconut','sour_cream',
    }
    _AROMATIC_KEYS = {
        'garlic','ginger','onion','shallot','scallion','leek','green_onion','chive',
        'lemongrass','galangal',
    }

    # Mediterranean / Middle Eastern cities should have olive_oil
    _MED_ME_COUNTRIES = {'GR','TR','IT','ES','PT','FR','LB','SY','IQ','IL','PS',
                         'EG','LY','TN','DZ','MA','MT','HR','BA','RS','ME','AL'}
    # East / SE Asian cities should have rice OR noodle
    _ASEANA_COUNTRIES = {'CN','JP','KR','TH','VN','MM','KH','LA','ID','MY','SG','PH','TW','HK'}
    # Sub-Saharan Africa should have palm_oil OR cassava OR yam
    _SSA_COUNTRIES = {'NG','GH','CI','SN','CM','CD','GN','MZ','TZ','KE','UG','RW',
                      'AO','ZM','ZW','MW','BJ','TG','BF','ML','NE','GA','CG','SS'}

    dim_gap_count = 0
    sparse_count = 0
    med_olive_warn = []
    asia_starch_warn = []
    ssa_starch_warn = []

    # Per-continent sparsity tracking (top-5 sparse per continent)
    from collections import defaultdict as _dd
    continent_sparse: dict = _dd(list)

    for i, place in enumerate(places):
        if i not in valid_indices:
            continue
        ingr = set(place.get("ingredients", {}).keys())
        ingr_count = len(ingr)
        city_name = place.get("name", "?")
        cc = place.get("countryCode", "")
        continent = place.get("continent", "?")

        # Dimensional coverage
        missing_dims = []
        if not (_STARCH_KEYS & ingr): missing_dims.append("starch")
        if not (_PROTEIN_KEYS & ingr): missing_dims.append("protein")
        if not (_FAT_KEYS & ingr): missing_dims.append("fat")
        if not (_AROMATIC_KEYS & ingr): missing_dims.append("aromatics")
        if len(missing_dims) >= 2:
            dim_gap_count += 1
            print(f"  ⚠ DIM GAP [{city_name} ({cc})]: missing {missing_dims}")
        elif ingr_count < 8:
            sparse_count += 1
            continent_sparse[continent].append((ingr_count, city_name))

        # Regional checks
        if cc in _MED_ME_COUNTRIES and 'olive_oil' not in ingr:
            med_olive_warn.append(city_name)
        if cc in _ASEANA_COUNTRIES and not (ingr & {'rice', 'noodle'}):
            asia_starch_warn.append(city_name)
        if cc in _SSA_COUNTRIES and not (ingr & {'palm_oil', 'cassava', 'yam'}):
            ssa_starch_warn.append(city_name)

    if dim_gap_count == 0:
        print(f"  ✓ All cities cover ≥2 of 4 culinary dimensions")
    else:
        print(f"  Total dimension-gap cities: {dim_gap_count}")

    if med_olive_warn:
        print(f"  ⚠ Med/ME cities missing olive_oil ({len(med_olive_warn)}): {', '.join(med_olive_warn[:5])}")
    if asia_starch_warn:
        print(f"  ⚠ E/SE Asian cities missing rice+noodle ({len(asia_starch_warn)}): {', '.join(asia_starch_warn[:5])}")
    if ssa_starch_warn:
        print(f"  ⚠ SSA cities missing palm_oil+cassava+yam ({len(ssa_starch_warn)}): {', '.join(ssa_starch_warn[:5])}")

    # Top-5 most ingredient-sparse cities per continent
    for cont, city_list in sorted(continent_sparse.items()):
        city_list.sort()
        top5 = city_list[:5]
        if top5:
            print(f"  ⚠ Sparse [{cont}]: {', '.join(f'{n}({c})' for c,n in top5)}")

    # IDF-weight features before UMAP to amplify regional discriminators over universal staples.
    # Garlic/onion appear in 90%+ of cities → low IDF → downweighted in the neighborhood graph.
    # Butter/coconut_oil/saffron/miso appear in 10-40% of cities → higher IDF → amplified signal.
    # Without IDF: cosine metric treats "both use garlic" the same as "both use saffron" →
    # Milan and Naples look 99.98% similar despite genuinely different fat/starch/protein profiles.
    # With IDF: UMAP neighborhoods reflect distinctive regional ingredients → proper separation.
    _df = (feature_matrix > 0.01).sum(axis=0).astype(np.float64)
    _n = float(feature_matrix.shape[0])
    _idf = np.log((_n + 1.0) / (_df + 1.0)) + 1.0  # smooth IDF, minimum weight = 1
    feature_matrix_idf = feature_matrix * _idf[np.newaxis, :]
    print(f"  IDF range: [{_idf.min():.2f}, {_idf.max():.2f}]  "
          f"(garlic≈{_idf[feature_names.index('ing:garlic') if 'ing:garlic' in feature_names else 0]:.2f}, "
          f"butter≈{_idf[feature_names.index('ing:butter') if 'ing:butter' in feature_names else 0]:.2f})")

    # Step 4 — 12D structural UMAP
    print("\n[4/7] Running 12D structural UMAP...")
    embedding = run_umap(feature_matrix_idf)

    # Step 4b — dedicated 3D color UMAP + calibration.
    # Separate UMAP run on the same IDF-weighted features.
    # 3D gives spherical hue: azimuth + elevation → eliminates same-2D-angle collisions.
    print("\n[4b/7] Running 3D color UMAP and computing calibration...")
    color_embedding_3d = run_umap_color(feature_matrix_idf)
    calibration, embedding_2d = compute_color_calibration(embedding, color_embedding_3d)
    print(f"  hue2d shape: {embedding_2d.shape}")

    # Step 5 — Write outputs
    print("\n[5/7] Writing outputs...")
    os.makedirs(OUT_DIR, exist_ok=True)

    n_cities = write_features_json(
        places, valid_indices, embedding, embedding_2d, ing_map, met_map, OUT_DIR
    )
    write_calibration_json(calibration, OUT_DIR)

    duration_s = time.time() - t0
    write_build_report(n_cities, len(feature_names), feature_names, n_ing, n_met, duration_s, OUT_DIR)
    write_ts_schemas(ing_keys, met_keys, OUT_DIR)

    # Step 6 — Discover dashboard insights
    print("\n[6/7] Computing Discover dashboard insights...")
    compute_insights(
        places, valid_indices, embedding, embedding_2d,
        calibration, feature_matrix, feature_names, OUT_DIR,
    )

    # Step 7 — H3 hex grid background fill
    print("\n[7/7] Building H3 hex grid (colored world background)...")
    build_hex_grid(places, valid_indices, embedding, embedding_2d, calibration, OUT_DIR)

    print("\n" + "=" * 60)
    print(f"Done in {duration_s:.0f}s")
    print(f"  {n_cities} cities × {len(feature_names)} features → {UMAP_N_COMPONENTS}D embedding")
    print(f"  Color calibration hash: {calibration['hash']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
