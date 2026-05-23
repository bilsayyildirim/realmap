// Compute one defining tag per country for the world-tag overlay.
// "Defining" = the ingredient or cooking method that is most ABOVE the world
// average for that country. So China shows 'rice' (high locally, only moderate
// globally), Italy shows 'olive oil', Korea shows 'kimchi', Iran shows 'saffron'
// — and we don't see 'onion' or 'tomato' everywhere (filtered by distinctiveness).

import type { Place } from '@realmap/shared';

export interface RegionTag {
  countryCode: string;
  label: string;
  score: number;
  distinctiveness: number;
  kind: 'ingredient' | 'method';
  lng: number;
  lat: number;
}

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
  const N = places.length;
  if (!N) return [];

  // ── Global means (sum / N, treating absent as 0) ──────────────────────────
  const globalSum = new Map<string, number>();
  const kindOf = new Map<string, 'ingredient' | 'method'>();
  for (const p of places) {
    for (const it of extractItems(p)) {
      globalSum.set(it.key, (globalSum.get(it.key) ?? 0) + it.value);
      kindOf.set(it.key, it.kind);
    }
  }
  const globalMean = new Map<string, number>();
  for (const [k, sum] of globalSum) globalMean.set(k, sum / N);

  // ── Group by country, find largest city for label position ───────────────
  const byCountry = new Map<string, { cities: Place[]; rep: Place }>();
  for (const p of places) {
    const cc = (p as any).countryCode;
    if (!cc) continue;
    let g = byCountry.get(cc);
    if (!g) { g = { cities: [], rep: p }; byCountry.set(cc, g); }
    g.cities.push(p);
    if (((p as any).population ?? 0) > ((g.rep as any).population ?? 0)) g.rep = p;
  }

  // ── Per country, find the most distinctive item ──────────────────────────
  const tags: RegionTag[] = [];
  for (const [cc, { cities, rep }] of byCountry) {
    const localSums = new Map<string, number>();
    for (const p of cities) {
      for (const it of extractItems(p)) {
        localSums.set(it.key, (localSums.get(it.key) ?? 0) + it.value);
      }
    }

    let best: { key: string; localMean: number; distinctiveness: number } | null = null;
    for (const [k, sum] of localSums) {
      const localMean = sum / cities.length;
      const gMean = globalMean.get(k) ?? 0;
      const distinctiveness = localMean - gMean;
      // Must be reasonably common locally AND above world average
      if (localMean < 0.55) continue;
      if (distinctiveness < 0.08) continue;
      if (!best || distinctiveness > best.distinctiveness) {
        best = { key: k, localMean, distinctiveness };
      }
    }

    if (!best) continue;
    const lng = (rep as any).longitude;
    const lat = (rep as any).latitude;
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;

    tags.push({
      countryCode: cc,
      label: best.key,
      score: best.localMean,
      distinctiveness: best.distinctiveness,
      kind: kindOf.get(best.key) ?? 'ingredient',
      lng, lat,
    });
  }

  return tags;
}
