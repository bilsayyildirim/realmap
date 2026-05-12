#!/usr/bin/env python3
"""
Standalone calibration regenerator — adds u_percentiles, v_percentiles, w_abs_percentiles
to an existing global_color_calibration.json without rerunning the 20-minute UMAP pipeline.

Usage:
    python3 packages/scripts/src/buildClusters/regen_calibration.py

Reads:
    data/features.json               (city embeddings + hue2d)
    data/global_color_calibration.json  (existing calibration)

Writes:
    data/global_color_calibration.json  (updated in-place with new CDF fields + new hash)
"""

import hashlib
import json
import math
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[4]  # repo root
FEATURES = ROOT / "data" / "features.json"
CALIBRATION = ROOT / "data" / "global_color_calibration.json"
N_BUCKETS = 512


def _make_axis_cdf(arr_sorted: np.ndarray, n_bins: int = N_BUCKETS) -> list[float]:
    n_pts = len(arr_sorted)
    return [float(arr_sorted[min(int(i * (n_pts - 1) / (n_bins - 1)), n_pts - 1)])
            for i in range(n_bins)]


def main() -> None:
    print(f"Reading {FEATURES} …")
    with open(FEATURES) as f:
        cities = json.load(f)

    print(f"Reading {CALIBRATION} …")
    with open(CALIBRATION) as f:
        cal = json.load(f)

    # Extract hue2d for all cities that have it
    hue2d_rows = []
    for city in cities:
        h = city.get("hue2d")
        if h and len(h) == 2:
            hue2d_rows.append(h)

    if not hue2d_rows:
        print("ERROR: no hue2d found in features.json — run build-clusters first", file=sys.stderr)
        sys.exit(1)

    hue2d = np.array(hue2d_rows, dtype=np.float64)
    print(f"  Found hue2d for {len(hue2d)} cities")

    # Recompute wNorm for each city using existing mu/sigma/B + quantiles
    mu = np.array(cal["mu"])
    sigma = np.array(cal["sigma"])
    B = np.array(cal["B"])  # [3, 12]
    q_w = cal["quantiles"]["w"]
    p50_w, p98_w, p02_w = q_w["p50"], q_w["p98"], q_w["p02"]

    emb_dim = len(mu)
    w_norms_list = []
    skipped = 0
    for city in cities:
        emb = city.get("embedding")
        if not emb or len(emb) < emb_dim:
            skipped += 1
            continue
        e = np.array(emb[:emb_dim], dtype=np.float64)
        z = (e - mu) / np.maximum(sigma, 1e-8)
        w_val = float(B[2] @ z)
        if w_val >= p50_w:
            w_norm = np.clip((w_val - p50_w) / max(p98_w - p50_w, 1e-8), 0.0, 1.0)
        else:
            w_norm = np.clip((w_val - p50_w) / max(p50_w - p02_w, 1e-8), -1.0, 0.0)
        w_norms_list.append(w_norm)

    if skipped:
        print(f"  Skipped {skipped} cities without valid embeddings")

    w_norms = np.array(w_norms_list, dtype=np.float64)

    # Build the three new CDFs
    u_percentiles = _make_axis_cdf(np.sort(hue2d[:, 0]))
    v_percentiles = _make_axis_cdf(np.sort(hue2d[:, 1]))
    w_abs_percentiles = _make_axis_cdf(np.sort(np.abs(w_norms)))

    # Sanity checks
    assert len(u_percentiles) == N_BUCKETS
    assert len(v_percentiles) == N_BUCKETS
    assert len(w_abs_percentiles) == N_BUCKETS
    print(f"  u range: [{u_percentiles[0]:.3f}, {u_percentiles[-1]:.3f}]")
    print(f"  v range: [{v_percentiles[0]:.3f}, {v_percentiles[-1]:.3f}]")
    print(f"  |w| range: [{w_abs_percentiles[0]:.3f}, {w_abs_percentiles[-1]:.3f}]")

    # Remove old hash before rebuilding
    cal.pop("hash", None)
    cal["u_percentiles"] = u_percentiles
    cal["v_percentiles"] = v_percentiles
    cal["w_abs_percentiles"] = w_abs_percentiles

    hash_src = json.dumps(cal, sort_keys=True, separators=(",", ":"))
    cal["hash"] = hashlib.md5(hash_src.encode()).hexdigest()[:12]

    with open(CALIBRATION, "w") as f:
        json.dump(cal, f, separators=(",", ":"))

    print(f"Written {CALIBRATION}")
    print(f"  new hash: {cal['hash']}")


if __name__ == "__main__":
    main()
