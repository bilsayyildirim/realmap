// H3 region tags with TF-IDF scoring.
//
// One H3 resolution (res 3, ~180 km cells) — fine enough to capture regional
// food identity, coarse enough that each cell sees enough cities for a stable
// TF-IDF estimate.
//
// TF-IDF (canonical text-mining distinctiveness measure):
//   TF  = local mean of an item in the cell
//   IDF = log(N_cells / cells_containing_item)
//   Score = TF × IDF
// Items that are LOCALLY common AND GLOBALLY rare — exactly what a
// "defining ingredient" label should capture.
//
// Multiple labels per cell: every (cell, item) pair whose TF-IDF clears a
// threshold becomes a candidate. We rank globally by TF-IDF and greedily
// emit them, deduping each label per macro-region (H3 res 2, ~485 km).
// A label can repeat across macro regions — that's a real cultural bridge
// (olive_oil in Italy AND Tunisia AND Greece is true and informative) —
// but never within one macro region, which prevents "fig fig fig" stacking.
//
// Position: each label sits at the *weighted centroid of the cities in its
// cell where that item is strongest*. Two labels in the same cell naturally
// land at different spots — where their signal actually lives. No
// hand-tuned offsets.

import { latLngToCell } from 'h3-js';
import type { Place } from '@realmap/shared';

export interface RegionTag {
  label: string;
  score: number;       // local mean
  tfidf: number;       // ranking score
  kind: 'ingredient' | 'method';
  lng: number;
  lat: number;
  cellId: string;
}

const H3_RES = 3;
const H3_MACRO_RES = 2;    // ~485 km cells — dedup neighborhood
const MIN_TF = 0.45;       // local mean must clear this to even be a candidate
const MIN_TFIDF = 0.12;    // TF-IDF cutoff
const DF_THRESHOLD = 0.3;  // mean above this counts the cell as containing the item

interface Item { key: string; value: number; kind: 'ingredient' | 'method' }

function extractItems(p: Place): Item[] {
  const out: Item[] = [];
  const ings = (p as any).ingredients ?? {};
  for (const [k, v] of Object.entries(ings)) {
    if (typeof v === 'number') out.push({ key: k, value: v as number, kind: 'ingredient' });
  }
  const methods = (p as any).cookingMethods ?? {};
  for (const [k, v] of Object.entries(methods)) {
    if (typeof v === 'number') out.push({ key: k, value: v as number, kind: 'method' });
  }
  return out;
}

export function computeRegionTags(places: Place[]): RegionTag[] {
  if (!places.length) return [];

  const cityItems: Item[][] = places.map(extractItems);
  const kindOf = new Map<string, 'ingredient' | 'method'>();
  for (const items of cityItems) {
    for (const it of items) kindOf.set(it.key, it.kind);
  }

  // Group city indices by H3 cell
  const byCell = new Map<string, number[]>();
  for (let i = 0; i < places.length; i++) {
    const p = places[i] as any;
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
    const cell = latLngToCell(p.latitude, p.longitude, H3_RES);
    let arr = byCell.get(cell);
    if (!arr) { arr = []; byCell.set(cell, arr); }
    arr.push(i);
  }

  // DF: number of cells where the item's local mean exceeds DF_THRESHOLD
  const cellPresence = new Map<string, Set<string>>();
  for (const [cell, cityIdxs] of byCell) {
    const localSums = new Map<string, number>();
    for (const i of cityIdxs) {
      for (const it of cityItems[i]!) {
        localSums.set(it.key, (localSums.get(it.key) ?? 0) + it.value);
      }
    }
    const n = cityIdxs.length;
    for (const [k, sum] of localSums) {
      if (sum / n > DF_THRESHOLD) {
        let set = cellPresence.get(k);
        if (!set) { set = new Set(); cellPresence.set(k, set); }
        set.add(cell);
      }
    }
  }
  const totalCells = byCell.size;

  // Per-city item score lookup so we can compute weighted centroids quickly
  const cityScore = (cityIdx: number, key: string): number => {
    for (const it of cityItems[cityIdx]!) if (it.key === key) return it.value;
    return 0;
  };

  type Candidate = {
    key: string;
    tfidf: number;
    localMean: number;
    cell: string;
    lat: number;
    lng: number;
  };
  const candidates: Candidate[] = [];

  for (const [cell, cityIdxs] of byCell) {
    const localSums = new Map<string, number>();
    for (const i of cityIdxs) {
      for (const it of cityItems[i]!) {
        localSums.set(it.key, (localSums.get(it.key) ?? 0) + it.value);
      }
    }
    const n = cityIdxs.length;

    for (const [k, sum] of localSums) {
      const tf = sum / n;
      if (tf < MIN_TF) continue;
      const df = cellPresence.get(k)?.size ?? 1;
      const idf = Math.log((totalCells + 1) / df);
      const tfidf = tf * idf;
      if (tfidf < MIN_TFIDF) continue;

      // Weighted centroid of cities in this cell by their score for k
      let wLat = 0, wLng = 0, wSum = 0;
      for (const i of cityIdxs) {
        const p = places[i] as any;
        const w = cityScore(i, k);
        if (w <= 0) continue;
        wLat += p.latitude * w;
        wLng += p.longitude * w;
        wSum += w;
      }
      if (wSum <= 0) continue;
      candidates.push({
        key: k, tfidf, localMean: tf, cell,
        lat: wLat / wSum,
        lng: wLng / wSum,
      });
    }
  }

  // Greedy dedup by (label, macro-cell). Allows a label to repeat across
  // distant macro regions (real bridges) but never within one ~485 km cell.
  candidates.sort((a, b) => b.tfidf - a.tfidf);
  const usedInMacro = new Set<string>(); // key: `${macroCell}|${label}`
  const out: RegionTag[] = [];
  for (const c of candidates) {
    const macro = latLngToCell(c.lat, c.lng, H3_MACRO_RES);
    const dedupKey = `${macro}|${c.key}`;
    if (usedInMacro.has(dedupKey)) continue;
    usedInMacro.add(dedupKey);
    out.push({
      label: c.key,
      score: c.localMean,
      tfidf: c.tfidf,
      kind: kindOf.get(c.key) ?? 'ingredient',
      lat: c.lat,
      lng: c.lng,
      cellId: c.cell,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selected-item tags: when the user picks chips in Discover, paint ONLY
// those labels on the map at the regions where each item is strong.
//
// For each selected item:
//   - Cities scoring ≥ threshold[item] are "hot" for it
//   - Group hot cities by H3 res 2 (~485 km macro cells) — one label per cell
//   - Position at weighted centroid of hot cities (weights = their score)
//
// This is the same "distinctively has" rule as the filter, applied as label
// placement instead of map coloring.
// ─────────────────────────────────────────────────────────────────────────────

export function computeSelectedTags(
  places: Place[],
  selectedItems: Set<string>,
  thresholds: Map<string, number>,
): RegionTag[] {
  if (!places.length || selectedItems.size === 0) return [];

  const kindLookup = new Map<string, 'ingredient' | 'method'>();
  for (const p of places) {
    const ings = (p as any).ingredients ?? {};
    for (const k of Object.keys(ings)) if (!kindLookup.has(k)) kindLookup.set(k, 'ingredient');
    const ms = (p as any).cookingMethods ?? {};
    for (const k of Object.keys(ms)) if (!kindLookup.has(k)) kindLookup.set(k, 'method');
  }

  const out: RegionTag[] = [];

  for (const item of selectedItems) {
    const thr = thresholds.get(item) ?? 0.5;
    // Group hot cities by macro cell
    type Hot = { lat: number; lng: number; score: number };
    const byCell = new Map<string, Hot[]>();

    for (const p of places) {
      if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
      const a = (p as any).ingredients?.[item];
      const b = (p as any).cookingMethods?.[item];
      const score = Math.max(
        typeof a === 'number' ? a : 0,
        typeof b === 'number' ? b : 0,
      );
      if (score < thr) continue;
      const cell = latLngToCell(p.latitude, p.longitude, H3_MACRO_RES);
      let arr = byCell.get(cell);
      if (!arr) { arr = []; byCell.set(cell, arr); }
      arr.push({ lat: p.latitude, lng: p.longitude, score });
    }

    for (const [cell, hot] of byCell) {
      let wLat = 0, wLng = 0, wSum = 0;
      for (const h of hot) {
        wLat += h.lat * h.score;
        wLng += h.lng * h.score;
        wSum += h.score;
      }
      if (wSum <= 0) continue;
      const avg = wSum / hot.length;
      out.push({
        label: item,
        score: avg,
        tfidf: avg,
        kind: kindLookup.get(item) ?? 'ingredient',
        lat: wLat / wSum,
        lng: wLng / wSum,
        cellId: cell,
      });
    }
  }

  return out;
}
