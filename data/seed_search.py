#!/usr/bin/env python3
"""
Seed search for 2D color UMAP.
Uses run.py's exact feature matrix pipeline to guarantee match.
Run inside Docker: docker run --rm -v $PWD/data:/app/data -v $PWD/packages/scripts/src/buildClusters:/app/scripts:ro realmap-buildclusters:latest python3 /app/data/seed_search.py
"""
import sys, math, json
import numpy as np

sys.path.insert(0, '/app/scripts')
import run as pipeline  # imports run.py for exact same feature building

# ── Build the same feature matrix as run.py ───────────────────────────────────
ing_map, met_map = pipeline.load_canonical_keys()
raw_places = pipeline.load_raw_places(pipeline.RAW_DIR)
feature_matrix, feature_names, valid_indices = pipeline.build_feature_matrix(raw_places, ing_map, met_map)
places = [raw_places[i] for i in valid_indices]
names_all = [p['name'] for p in places]
cc_all = [p.get('countryCode', '') for p in places]

# IDF weighting (exact same as run.py)
_df = (feature_matrix > 0.01).sum(axis=0).astype(np.float64)
_n = float(feature_matrix.shape[0])
_idf = np.log((_n + 1.0) / (_df + 1.0)) + 1.0
feature_matrix_idf = feature_matrix * _idf[np.newaxis, :]
print(f"Feature matrix: {feature_matrix_idf.shape}  IDF range: [{_idf.min():.2f}, {_idf.max():.2f}]", flush=True)

import umap as umap_lib

# Test pairs: (city1, cc1, city2, cc2, op, thresh)
key_pairs = [
    ('Venice', 'IT', 'Palermo', 'IT', '>=', 20),
    ('İzmir', 'TR', 'Ankara', 'TR', '>=', 25),
    ('İzmir', 'TR', 'Gaziantep', 'TR', '>=', 20),
    ('Lagos', 'NG', 'Accra', 'GH', '<=', 160),
    ('Addis Ababa', 'ET', 'Nairobi', 'KE', '>=', 10),
    ('Trabzon', 'TR', 'Gaziantep', 'TR', '>=', 5),
    ('Cairo', 'EG', 'Alexandria', 'EG', '<=', 165),
    ('Oslo', 'NO', 'Accra', 'GH', '>=', 30),
    ('London', 'GB', 'Istanbul', 'TR', '>=', 15),
    ('Bucharest', 'RO', 'Beijing', 'CN', '>=', 20),
    ('Reykjavik', 'IS', 'Bangkok', 'TH', '>=', 15),
    ('Tokyo', 'JP', 'Lagos', 'NG', '>=', 15),
]

def angle_diff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)

name_cc_set = set(zip(names_all, cc_all))

for seed in range(42, 300):
    reducer = umap_lib.UMAP(
        n_components=2, metric='cosine', n_neighbors=15,
        min_dist=0.10, random_state=seed, init='random', n_jobs=1, verbose=False,
    )
    emb2d = reducer.fit_transform(feature_matrix_idf)
    cx = emb2d[:, 0] - np.median(emb2d[:, 0])
    cy = emb2d[:, 1] - np.median(emb2d[:, 1])
    r98 = max(float(np.percentile(np.sqrt(cx**2 + cy**2), 98)), 1e-8)
    hue2d = np.stack([cx / r98, cy / r98], axis=1)
    angles = {(names_all[i], cc_all[i]): (math.atan2(hue2d[i, 1], hue2d[i, 0]) + math.pi) * 180 / math.pi
              for i in range(len(names_all))}

    all_pass = True
    parts = []
    for c1, cc1, c2, cc2, op, thresh in key_pairs:
        k1, k2 = (c1, cc1), (c2, cc2)
        if k1 not in angles or k2 not in angles:
            parts.append(f"{c1[:4]}/{c2[:4]}:?")
            continue
        diff = angle_diff(angles[k1], angles[k2])
        passed = (diff >= thresh if op == '>=' else diff <= thresh)
        if not passed:
            all_pass = False
        parts.append(f"{c1[:4]}/{c2[:4]}:{diff:.0f}{'✓' if passed else '✗'}")

    print(f"seed={seed:3d}  {' '.join(parts)}  {'*** ALL PASS ***' if all_pass else ''}", flush=True)
    if all_pass:
        print(f"\nWINNER: seed={seed}")
        break
