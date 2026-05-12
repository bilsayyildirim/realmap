#!/usr/bin/env python3
"""
RealMap Color & Clustering Test Report
=======================================
Generates a self-contained HTML visual audit of every city's color,
hue distribution, cross-continental separation, and clustering quality.

Usage:
  python3 data/color_report.py             # writes data/color_report.html
  python3 data/color_report.py --open      # also opens in default browser

Depends on:
  data/features.json          (produced by make build-clusters)
  data/global_color_calibration.json

No third-party packages required — pure stdlib math.
"""

import json
import math
import os
import sys
import webbrowser
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
FEATURES_PATH = os.path.join(HERE, "features.json")
CALIBRATION_PATH = os.path.join(HERE, "global_color_calibration.json")
OUTPUT_PATH = os.path.join(HERE, "color_report.html")


# ── Color math (mirrors colorUtils.ts exactly) ──────────────────────────────

def _in_gamut(r, g, b):
    return 0 <= r <= 1 and 0 <= g <= 1 and 0 <= b <= 1


def _oklch_to_linear_srgb(L, C, H_rad):
    a = C * math.cos(H_rad)
    b_lab = C * math.sin(H_rad)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b_lab
    m_ = L - 0.1055613458 * a - 0.0638541728 * b_lab
    s_ = L - 0.0894841775 * a - 1.2914855480 * b_lab
    l = l_ ** 3
    m = m_ ** 3
    s = s_ ** 3
    r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return r, g, b


def _gamma(c):
    c = max(0.0, min(1.0, c))
    if c <= 0.0031308:
        return 12.92 * c
    return 1.055 * c ** (1.0 / 2.4) - 0.055


def oklch_to_hex(L, C, H_deg):
    """Convert OKLCH to #rrggbb with binary-search gamut clipping on chroma."""
    H = math.radians(H_deg % 360)
    L = max(0.0, min(1.0, L))

    r, g, b = _oklch_to_linear_srgb(L, C, H)
    if not _in_gamut(r, g, b):
        lo, hi = 0.0, C
        for _ in range(18):
            mid = (lo + hi) * 0.5
            r, g, b = _oklch_to_linear_srgb(L, mid, H)
            if _in_gamut(r, g, b):
                lo = mid
            else:
                hi = mid
        r, g, b = _oklch_to_linear_srgb(L, lo, H)

    ri = max(0, min(255, round(_gamma(r) * 255)))
    gi = max(0, min(255, round(_gamma(g) * 255)))
    bi = max(0, min(255, round(_gamma(b) * 255)))
    return f"#{ri:02x}{gi:02x}{bi:02x}"


def _normalize_robust(val, axis):
    p50 = axis.get("p50")
    if p50 is not None:
        up = max(1e-8, axis["p98"] - p50)
        down = max(1e-8, p50 - axis["p02"])
        scale = up if val >= p50 else down
        return max(-1.0, min(1.0, (val - p50) / scale))
    span = max(1e-8, axis["p98"] - axis["p02"])
    return max(-1.0, min(1.0, (val - axis["p02"]) / span * 2.0 - 1.0))


def _equalize_angle(raw_angle, percentiles):
    n = len(percentiles)
    lo, hi = 0, n - 1
    while lo < hi:
        mid = (lo + hi) >> 1
        if percentiles[mid] < raw_angle:
            lo = mid + 1
        else:
            hi = mid
    if 0 < lo < n:
        lo_v = percentiles[lo - 1]
        hi_v = percentiles[lo]
        t = (raw_angle - lo_v) / (hi_v - lo_v) if hi_v > lo_v else 0.0
        return ((lo - 1 + t) / (n - 1)) * 2 * math.pi
    return (lo / (n - 1)) * 2 * math.pi


def compute_city_color(place, cal):
    """
    Compute OKLCH hex color for a city, mirroring colorUtils.ts getCityColor().
    Returns (hex, H_deg, L, C, u_norm, v_norm, w_norm).
    """
    emb = place.get("embedding", [])
    if not emb:
        return "#cccccc", 0, 0, 0, 0, 0, 0

    mu = cal["mu"]
    sigma = cal["sigma"]
    B = cal["B"]
    quantiles = cal["quantiles"]
    n = min(len(emb), len(mu))

    centered = [emb[d] - mu[d] for d in range(n)]
    whitened = [centered[d] / max(1e-8, sigma[d]) for d in range(n)]

    u = sum(whitened[d] * B[0][d] for d in range(n))
    v = sum(whitened[d] * B[1][d] for d in range(n))
    w = sum(whitened[d] * B[2][d] for d in range(n))

    u_n = _normalize_robust(u, quantiles["u"])
    v_n = _normalize_robust(v, quantiles["v"])
    w_n = _normalize_robust(w, quantiles["w"])

    # Prefer hue2d (2D color UMAP) → histogram-equalized angle → Hue
    # Fall back to hueAngle (old 1D builds) or PCA atan2 (legacy)
    hue2d = place.get("hue2d")
    hue_angle = place.get("hueAngle")
    ap = cal.get("angle_percentiles", [])
    if hue2d is not None and len(hue2d) == 2:
        raw_angle = math.atan2(hue2d[1], hue2d[0]) + math.pi
        radius = math.sqrt(hue2d[0] ** 2 + hue2d[1] ** 2)
    elif hue_angle is not None:
        raw_angle = hue_angle
        radius = math.sqrt(u_n ** 2 + v_n ** 2)
    else:
        raw_angle = math.atan2(v_n, u_n) + math.pi
        radius = math.sqrt(u_n ** 2 + v_n ** 2)
    if len(ap) > 1:
        H = (_equalize_angle(raw_angle, ap) * 180.0 / math.pi) % 360.0
    else:
        H = (raw_angle * 180.0 / math.pi) % 360.0
    chroma_spread = 1.0 - math.exp(-2.5 * radius)
    w_boost = 0.10 * (1.0 - math.exp(-2.0 * abs(w_n)))
    C = max(0.12, min(0.38, 0.12 + 0.26 * chroma_spread + w_boost))
    L = max(0.54, min(0.82, 0.62 + 0.18 * w_n))

    hex_color = oklch_to_hex(L, C, H)
    return hex_color, H, L, C, u_n, v_n, w_n


# ── Hue difference (circular) ────────────────────────────────────────────────

def hue_diff_deg(ha_rad, hb_rad):
    a = (ha_rad * 180 / math.pi) % 360
    b = (hb_rad * 180 / math.pi) % 360
    d = abs(a - b)
    return min(d, 360 - d)


# ── Color tests (same pairs as validate_data.py) ─────────────────────────────

COLOR_MUST_DISTINCT = [
    ("Dublin",       "Beijing",   20, "Ireland vs China — original regression"),
    ("Dublin",       "Bangkok",   12, "Ireland vs Thailand"),
    ("Cork",         "Shanghai",  15, "Ireland vs China"),
    ("Oslo",         "Lagos",     15, "Scandinavia vs W.Africa"),
    ("Moscow",       "Singapore", 15, "Russia vs SE Asia"),
    ("Paris",        "Tokyo",     15, "France vs Japan"),
    ("London",       "Chengdu",   15, "UK vs Sichuan China"),
    ("Cairo",        "Seoul",     15, "Egypt vs Korea"),
    ("Nairobi",      "Beijing",   10, "E.Africa vs China"),
    ("Lagos",        "Tokyo",     10, "W.Africa vs Japan"),
    ("Mexico City",  "Beijing",   10, "Mexico vs China"),
    ("Sydney",       "Beijing",   10, "Australia vs China"),
    ("Mumbai",       "Tokyo",     10, "India vs Japan"),
    ("Buenos Aires", "Tokyo",     10, "Argentina vs Japan"),
    ("Helsinki",     "Mumbai",    10, "Finland vs India"),
    ("Stockholm",    "Nairobi",   10, "Scandinavia vs E.Africa"),
    ("Warsaw",       "Seoul",     10, "Poland vs Korea"),
    ("Athens",       "Beijing",   10, "Greece vs China"),
    ("Lima",         "Beijing",   10, "Peru vs China"),
    ("Reykjavik",    "Bangkok",   10, "Iceland vs Thailand"),
    ("Berlin",       "Tokyo",     10, "Germany vs Japan"),
    ("Vienna",       "Shanghai",  10, "Austria vs China"),
    ("Amsterdam",    "Lagos",     10, "Netherlands vs W.Africa"),
    ("Copenhagen",   "Delhi",     10, "Denmark vs India"),
    ("São Paulo",    "Beijing",    5, "Brazil vs China — share rice/pork/garlic"),
    ("Lagos",        "Beijing",    5, "W.Africa vs China — share rice/pork/onion"),
    ("Mumbai",       "Beijing",    5, "India vs China — share rice/garlic/onion"),
]


# ── Data loading ─────────────────────────────────────────────────────────────

def load_data():
    if not os.path.exists(FEATURES_PATH):
        print(f"ERROR: {FEATURES_PATH} not found — run 'make build-clusters' first.")
        sys.exit(1)
    if not os.path.exists(CALIBRATION_PATH):
        print(f"ERROR: {CALIBRATION_PATH} not found — run 'make build-clusters' first.")
        sys.exit(1)

    with open(FEATURES_PATH, encoding="utf-8") as f:
        features = json.load(f)
    with open(CALIBRATION_PATH, encoding="utf-8") as f:
        cal = json.load(f)

    # Dedupe by name (highest population wins)
    lookup = {}
    for p in features:
        name = p.get("name", "")
        if name not in lookup or (p.get("population") or 0) > (lookup[name].get("population") or 0):
            lookup[name] = p

    return features, cal, lookup


# ── HTML generation ──────────────────────────────────────────────────────────

def luminance_from_hex(h):
    """Relative luminance of hex color → choose black/white label."""
    h = h.lstrip("#")
    r = int(h[0:2], 16) / 255
    g = int(h[2:4], 16) / 255
    b = int(h[4:6], 16) / 255

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return Y


def label_color(hex_color):
    return "#000" if luminance_from_hex(hex_color) > 0.35 else "#fff"


def generate_html(features, cal, lookup):
    print(f"  Computing colors for {len(features)} cities...")

    # Compute color for every city
    city_colors = []
    for p in features:
        if not p.get("embedding"):
            continue
        hex_c, H, L, C, u_n, v_n, w_n = compute_city_color(p, cal)
        city_colors.append({
            "name": p.get("name", "?"),
            "country": p.get("countryCode", ""),
            "continent": p.get("continent", "Unknown"),
            "population": p.get("population") or 0,
            "hue_angle": H,
            "hue_deg": H,
            "L": L,
            "C": C,
            "hex": hex_c,
            "u": u_n,
            "v": v_n,
            "w": w_n,
            "ingredients": list((p.get("ingredients") or {}).keys())[:5],
        })

    city_colors.sort(key=lambda x: x["hue_deg"])

    # ── Run color separation tests ──
    test_results = []
    pass_n = fail_n = skip_n = 0
    for city_a, city_b, min_sep, desc in COLOR_MUST_DISTINCT:
        pa = lookup.get(city_a)
        pb = lookup.get(city_b)
        if not pa or not pb or not pa.get("embedding") or not pb.get("embedding"):
            skip_n += 1
            test_results.append({"a": city_a, "b": city_b, "diff": None,
                                  "min": min_sep, "desc": desc, "status": "skip"})
            continue
        hex_a, Ha, *_ = compute_city_color(pa, cal)
        hex_b, Hb, *_ = compute_city_color(pb, cal)
        diff = abs(Ha - Hb)
        diff = min(diff, 360 - diff)
        ok = diff >= min_sep

        if ok:
            pass_n += 1
        else:
            fail_n += 1
        test_results.append({"a": city_a, "b": city_b, "diff": diff,
                              "min": min_sep, "desc": desc, "status": "pass" if ok else "fail",
                              "hex_a": hex_a, "hex_b": hex_b})

    # ── Top-200 cross-continental statistical test ──
    by_pop = sorted(lookup.values(), key=lambda p: p.get("population") or 0, reverse=True)
    top200 = [p for p in by_pop if p.get("embedding")][:200]
    # Pre-compute H for top200 to avoid O(n²) recomputation
    top200_h = {p["name"]: compute_city_color(p, cal)[1] for p in top200}
    cross_total = cross_ok = 0
    worst_cross = []
    for i in range(len(top200)):
        for j in range(i + 1, len(top200)):
            pa2, pb2 = top200[i], top200[j]
            if (pa2.get("continent") or "") == (pb2.get("continent") or ""):
                continue
            cross_total += 1
            Ha2 = top200_h[pa2["name"]]
            Hb2 = top200_h[pb2["name"]]
            diff = abs(Ha2 - Hb2)
            diff = min(diff, 360 - diff)
            if diff >= 10:
                cross_ok += 1
            else:
                worst_cross.append((diff, pa2["name"], pb2["name"]))
    cross_pct = 100.0 * cross_ok / cross_total if cross_total else 0
    stat_ok = cross_pct >= 80.0
    if stat_ok:
        pass_n += 1
    else:
        fail_n += 1
    worst_cross.sort()

    # ── Continent stats ──
    cont_map = defaultdict(list)
    for c in city_colors:
        cont_map[c["continent"]].append(c)

    # ── Build HTML ──────────────────────────────────────────────────────────
    print(f"  Tests: {pass_n} pass, {fail_n} fail, {skip_n} skip")
    print(f"  Cross-continental top-200: {cross_pct:.1f}% ≥10° (need ≥80%)")

    status_emoji = "✅" if fail_n == 0 else "❌"

    def swatch(hex_c, label, title="", size=36):
        lc = label_color(hex_c)
        ts = f' title="{title}"' if title else ""
        return (f'<div class="swatch" style="background:{hex_c};color:{lc};'
                f'width:{size}px;height:{size}px;font-size:{max(7,size//5)}px;"'
                f'{ts}>{label}</div>')

    def pair_row(r):
        if r["status"] == "skip":
            return (f'<tr class="skip"><td>{r["a"]}</td><td>{r["b"]}</td>'
                    f'<td>—</td><td>≥{r["min"]}°</td><td>⊘ missing</td>'
                    f'<td>{r["desc"]}</td></tr>')
        diff_str = f'{r["diff"]:.1f}°'
        margin = r["diff"] - r["min"]
        margin_str = f'+{margin:.1f}°' if margin >= 0 else f'{margin:.1f}°'
        cls = r["status"]
        icon = "✓" if cls == "pass" else "✗"
        return (
            f'<tr class="{cls}">'
            f'<td><span class="city-dot" style="background:{r["hex_a"]}"></span>{r["a"]}</td>'
            f'<td><span class="city-dot" style="background:{r["hex_b"]}"></span>{r["b"]}</td>'
            f'<td style="font-weight:bold">{diff_str}</td>'
            f'<td>≥{r["min"]}°</td>'
            f'<td>{icon} {margin_str}</td>'
            f'<td>{r["desc"]}</td>'
            f'</tr>'
        )

    # Hue-sorted city grid (200 per row, small swatches)
    grid_html = ""
    SWATCH_SIZE = 22
    for c in city_colors:
        title = f'{c["name"]} ({c["country"]}) — {c["continent"]}\nHue: {c["hue_deg"]:.0f}° L:{c["L"]:.2f} C:{c["C"]:.2f}\nTop: {", ".join(c["ingredients"][:3])}'
        grid_html += swatch(c["hex"], "", title=title, size=SWATCH_SIZE)

    # Continent panels
    continent_order = ["Europe", "Asia", "Africa", "North America",
                       "South America", "Oceania", "Antarctica"]
    all_conts = sorted(cont_map.keys(),
                       key=lambda k: continent_order.index(k) if k in continent_order else 99)
    cont_html = ""
    for cont in all_conts:
        cities = sorted(cont_map[cont], key=lambda x: x["hue_deg"])
        cont_html += f'<div class="continent-panel"><h3>{cont} <small>({len(cities)} cities)</small></h3>'
        cont_html += '<div class="swatch-row">'
        for c in cities:
            title = f'{c["name"]} ({c["country"]})\nHue:{c["hue_deg"]:.0f}° L:{c["L"]:.2f} C:{c["C"]:.2f}\nTop: {", ".join(c["ingredients"][:3])}'
            cont_html += swatch(c["hex"], c["name"][:2], title=title, size=28)
        cont_html += "</div></div>"

    # Problem pairs (cross-continental, hue diff < 20°)
    problem_rows = ""
    worst25 = worst_cross[:25]
    if worst25:
        for diff, na, nb in worst25:
            pa2 = lookup.get(na)
            pb2 = lookup.get(nb)
            ha = oklch_to_hex(*compute_city_color(pa2, cal)[1:4]) if pa2 else "#ccc"
            hb = oklch_to_hex(*compute_city_color(pb2, cal)[1:4]) if pb2 else "#ccc"
            # Recompute proper hex
            ha = compute_city_color(pa2, cal)[0] if pa2 else "#ccc"
            hb = compute_city_color(pb2, cal)[0] if pb2 else "#ccc"
            problem_rows += (
                f'<tr><td><span class="city-dot" style="background:{ha}"></span>{na}</td>'
                f'<td><span class="city-dot" style="background:{hb}"></span>{nb}</td>'
                f'<td style="color:{"#c00" if diff < 10 else "#885500"}">{diff:.1f}°</td></tr>'
            )
    else:
        problem_rows = '<tr><td colspan="3" style="color:#060">No close pairs — excellent separation!</td></tr>'

    test_rows = "\n".join(pair_row(r) for r in test_results)

    # Hue histogram (36 buckets of 10°)
    hist = [0] * 36
    for c in city_colors:
        hist[int(c["hue_deg"] / 10) % 36] += 1
    max_h = max(hist) or 1
    hist_bars = ""
    for i, count in enumerate(hist):
        hue = i * 10 + 5
        bar_h = max(2, round(80 * count / max_h))
        hex_c = oklch_to_hex(0.65, 0.25, hue)
        hist_bars += (
            f'<div class="hist-bar" style="height:{bar_h}px;background:{hex_c}" '
            f'title="{hue}°: {count} cities"></div>'
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RealMap Color & Clustering Report</title>
<style>
  body {{ font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px;
          background: #f5f5f0; color: #222; }}
  h1 {{ margin: 0 0 4px; font-size: 1.6rem; }}
  h2 {{ font-size: 1.15rem; margin: 24px 0 8px; border-bottom: 2px solid #ddd; padding-bottom: 4px; }}
  h3 {{ font-size: 1rem; margin: 12px 0 6px; }}
  small {{ font-weight: normal; color: #666; }}
  .header {{ display:flex; align-items:baseline; gap: 16px; flex-wrap:wrap; }}
  .badge {{ padding: 3px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 600; }}
  .badge-ok {{ background: #d4edda; color: #155724; }}
  .badge-fail {{ background: #f8d7da; color: #721c24; }}
  .badge-info {{ background: #d1ecf1; color: #0c5460; }}
  .stats-row {{ display:flex; gap:16px; flex-wrap:wrap; margin: 12px 0; }}
  .stat-box {{ background:#fff; border-radius:8px; padding:10px 16px; min-width:100px;
               box-shadow:0 1px 3px rgba(0,0,0,.1); text-align:center; }}
  .stat-num {{ font-size:1.8rem; font-weight:700; line-height:1; }}
  .stat-lbl {{ font-size:0.75rem; color:#666; margin-top:2px; }}
  .stat-ok {{ color: #155724; }}
  .stat-fail {{ color: #721c24; }}
  .stat-warn {{ color: #856404; }}
  table {{ border-collapse: collapse; width:100%; font-size:0.85rem; }}
  th {{ background:#eee; padding:6px 8px; text-align:left; position:sticky; top:0; }}
  td {{ padding:5px 8px; border-bottom:1px solid #eee; vertical-align:middle; }}
  tr.pass td {{ background:#f0fff4; }}
  tr.fail td {{ background:#fff0f0; font-weight:500; }}
  tr.skip td {{ background:#fafafa; color:#999; }}
  .city-dot {{ display:inline-block; width:14px; height:14px; border-radius:50%;
               margin-right:5px; vertical-align:middle; border:1px solid rgba(0,0,0,.2); }}
  .swatch {{ display:inline-flex; align-items:center; justify-content:center;
             border-radius:3px; margin:1px; cursor:default; overflow:hidden;
             white-space:nowrap; font-family:monospace; border:1px solid rgba(0,0,0,.1);
             flex-shrink:0; box-sizing:border-box; }}
  .swatch-row {{ display:flex; flex-wrap:wrap; gap:1px; align-items:center; }}
  .grid-wrap {{ display:flex; flex-wrap:wrap; gap:1px; }}
  .continent-panel {{ margin-bottom:12px; background:#fff; border-radius:8px;
                      padding:10px 12px; box-shadow:0 1px 3px rgba(0,0,0,.08); }}
  .hist-wrap {{ display:flex; align-items:flex-end; gap:2px; height:90px;
                background:#fff; padding:6px; border-radius:6px; margin-bottom:8px; }}
  .hist-bar {{ width:16px; border-radius:2px 2px 0 0; transition:height .2s; cursor:default; }}
  .section {{ background:#fff; border-radius:8px; padding:14px 16px;
              margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.08); }}
  details summary {{ cursor:pointer; font-weight:600; font-size:0.9rem; }}
  details[open] summary {{ margin-bottom:10px; }}
  .note {{ font-size:0.8rem; color:#555; margin:4px 0 10px; }}
  .cross-stat {{ font-size:0.9rem; padding:8px 12px; border-radius:6px; margin: 8px 0; }}
  .cross-ok {{ background:#d4edda; color:#155724; }}
  .cross-fail {{ background:#f8d7da; color:#721c24; }}
</style>
</head>
<body>

<div class="header">
  <h1>🗺️ RealMap Color &amp; Clustering Report</h1>
  <span class="badge {'badge-ok' if fail_n == 0 else 'badge-fail'}">{status_emoji} {pass_n} pass · {fail_n} fail · {skip_n} skip</span>
  <span class="badge badge-info">{len(city_colors)} cities · {len(cal.get("mu", []))}D embedding</span>
</div>
<p class="note">Generated from <code>data/features.json</code> (calibration hash: <code>{cal.get("hash","?")}</code>)</p>

<div class="stats-row">
  <div class="stat-box">
    <div class="stat-num {'stat-ok' if pass_n > 0 else ''}">{pass_n}</div>
    <div class="stat-lbl">Tests passed</div>
  </div>
  <div class="stat-box">
    <div class="stat-num {'stat-fail' if fail_n > 0 else 'stat-ok'}">{fail_n}</div>
    <div class="stat-lbl">Tests failed</div>
  </div>
  <div class="stat-box">
    <div class="stat-num">{len(city_colors)}</div>
    <div class="stat-lbl">Cities colored</div>
  </div>
  <div class="stat-box">
    <div class="stat-num {'stat-ok' if stat_ok else 'stat-fail'}">{cross_pct:.0f}%</div>
    <div class="stat-lbl">Cross-cont. ≥10° (top 200)</div>
  </div>
</div>

<!-- ── Section 1: Color Separation Tests ─────────────────────────────────── -->
<div class="section">
  <h2>Color Separation Tests</h2>
  <p class="note">Each row is a cross-continental pair that must have a minimum hue difference to be visually distinguishable on the map.</p>
  <div class="cross-stat {'cross-ok' if stat_ok else 'cross-fail'}">
    Statistical (top-200 cities): <strong>{cross_pct:.1f}%</strong> of cross-continental pairs have ≥10° hue difference
    (threshold: ≥80%) — {'✓ PASS' if stat_ok else '✗ FAIL'}
  </div>
  <table>
    <thead><tr><th>City A</th><th>City B</th><th>Δhue</th><th>Min</th><th>Result</th><th>Notes</th></tr></thead>
    <tbody>{test_rows}</tbody>
  </table>
</div>

<!-- ── Section 2: Hue Distribution ──────────────────────────────────────── -->
<div class="section">
  <h2>Hue Distribution (10° buckets)</h2>
  <p class="note">Ideally uniform — tall spikes mean many cities share a narrow hue band.</p>
  <div class="hist-wrap">{hist_bars}</div>
  <div style="font-size:0.75rem;color:#888;display:flex;justify-content:space-between;padding:0 6px">
    <span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span>
  </div>
</div>

<!-- ── Section 3: All Cities by Hue ─────────────────────────────────────── -->
<div class="section">
  <details>
    <summary>All Cities — Hue-Sorted Swatch Grid ({len(city_colors)} cities)</summary>
    <p class="note">Hover any swatch to see city name, continent, and top ingredients.</p>
    <div class="grid-wrap">{grid_html}</div>
  </details>
</div>

<!-- ── Section 4: Continent Breakdown ───────────────────────────────────── -->
<div class="section">
  <h2>Continent Breakdown</h2>
  <p class="note">Cities within a continent should form visually coherent color bands.</p>
  {cont_html}
</div>

<!-- ── Section 5: Closest Cross-Continental Pairs ───────────────────────── -->
<div class="section">
  <h2>Closest Cross-Continental Pairs (top 200 cities)</h2>
  <p class="note">Pairs with the smallest hue difference across continents — these are the most likely to look confusingly similar on the map.</p>
  <table>
    <thead><tr><th>City A</th><th>City B</th><th>Δhue</th></tr></thead>
    <tbody>{problem_rows}</tbody>
  </table>
</div>

</body>
</html>"""

    return html


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    open_browser = "--open" in sys.argv

    print("=" * 60)
    print("RealMap Color & Clustering Report")
    print("=" * 60)

    features, cal, lookup = load_data()
    html = generate_html(features, cal, lookup)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f"\n✅ Report written: {OUTPUT_PATH}  ({size_kb} KB)")
    print(f"   Open in browser: open {OUTPUT_PATH}")

    if open_browser:
        webbrowser.open(f"file://{OUTPUT_PATH}")


if __name__ == "__main__":
    main()
