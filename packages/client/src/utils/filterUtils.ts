// Distinctiveness filter utilities.
//
// "Distinctively has X" = the city scores at or above the 75th percentile of
// non-zero scores worldwide for that item, with a hard floor at 0.5 (the
// CLAUDE.md "meaningful presence" threshold). For rare items (saffron,
// teff) the floor dominates; for ubiquitous items (rice, salt) the
// percentile dominates so only true rice-cuisine cities clear it.

import type { Place } from '@realmap/shared';

export interface ItemCatalog {
  ingredients: { key: string; count: number }[];
  methods: { key: string; count: number }[];
}

const PCT = 0.75;
const FLOOR = 0.5;

export function computeItemThresholds(places: Place[]): Map<string, number> {
  const scoresByItem = new Map<string, number[]>();
  for (const p of places) {
    const ings = (p as any).ingredients ?? {};
    for (const [k, v] of Object.entries(ings)) {
      if (typeof v === 'number' && v > 0) {
        let arr = scoresByItem.get(k);
        if (!arr) { arr = []; scoresByItem.set(k, arr); }
        arr.push(v as number);
      }
    }
    const ms = (p as any).cookingMethods ?? {};
    for (const [k, v] of Object.entries(ms)) {
      if (typeof v === 'number' && v > 0) {
        let arr = scoresByItem.get(k);
        if (!arr) { arr = []; scoresByItem.set(k, arr); }
        arr.push(v as number);
      }
    }
  }
  const out = new Map<string, number>();
  for (const [k, scores] of scoresByItem) {
    scores.sort((a, b) => a - b);
    const idx = Math.min(scores.length - 1, Math.floor(scores.length * PCT));
    out.set(k, Math.max(FLOOR, scores[idx] ?? FLOOR));
  }
  return out;
}

export function computeItemCatalog(places: Place[]): ItemCatalog {
  const ingCounts = new Map<string, number>();
  const methCounts = new Map<string, number>();
  for (const p of places) {
    const ings = (p as any).ingredients ?? {};
    for (const [k, v] of Object.entries(ings)) {
      if (typeof v === 'number' && v >= FLOOR) {
        ingCounts.set(k, (ingCounts.get(k) ?? 0) + 1);
      }
    }
    const ms = (p as any).cookingMethods ?? {};
    for (const [k, v] of Object.entries(ms)) {
      if (typeof v === 'number' && v >= FLOOR) {
        methCounts.set(k, (methCounts.get(k) ?? 0) + 1);
      }
    }
  }
  const sort = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    ingredients: [...ingCounts.entries()].sort(sort).map(([key, count]) => ({ key, count })),
    methods: [...methCounts.entries()].sort(sort).map(([key, count]) => ({ key, count })),
  };
}

export function placeMatches(
  p: Place,
  selected: Set<string>,
  thresholds: Map<string, number>,
): boolean {
  if (selected.size === 0) return true;
  const ings = (p as any).ingredients ?? {};
  const ms = (p as any).cookingMethods ?? {};
  for (const item of selected) {
    const thr = thresholds.get(item) ?? FLOOR;
    const a = ings[item];
    if (typeof a === 'number' && a >= thr) return true;
    const b = ms[item];
    if (typeof b === 'number' && b >= thr) return true;
  }
  return false;
}
