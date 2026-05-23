// Compute pre-aggregated cross-cuisine discoveries from the city embeddings.
// All math is one-pass over the data; runs once and caches.

import type { Place } from '@realmap/shared';

export interface Twin {
  a: Place;
  b: Place;
  embeddingDist: number; // smaller = more similar in 12-D embedding
  geoKm: number;         // greater = more interesting (far apart)
}

export interface LonelyCity {
  place: Place;
  nearestDist: number;   // distance to closest cuisine in 12-D embedding
  nearestCity: Place;
}

export interface CountryDiversity {
  countryCode: string;
  cityCount: number;
  meanIntraDistance: number; // average pairwise 12-D embedding distance within the country
}

export interface IngredientRanking {
  ingredient: string;
  cities: { place: Place; score: number }[];
  worldwideCount: number;
}

export interface PathHop {
  place: Place;
  hopDist: number;
}

export interface DiscoveryStats {
  twins: Twin[];
  loneliest: LonelyCity[];
  countryDiversity: CountryDiversity[];
  globalIngredients: string[]; // unique ingredient keys across all cities, sorted by global frequency
  // graph data for path-finding
  topNearestPerCity: { idx: number; dist: number }[][]; // for use by path-finding
  validPlaces: Place[];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function computeDiscoveries(places: Place[]): DiscoveryStats {
  const valid = places.filter(
    (p) => Array.isArray((p as any).embedding) && (p as any).embedding.length > 0,
  ) as (Place & { embedding: number[] })[];

  const N = valid.length;
  const TOP_K = 8; // keep top-8 nearest per city — used for twins + path-finding + lonely

  // Pre-extract embeddings for tight inner loop
  const embs: number[][] = valid.map((p) => p.embedding);
  const D = embs[0]?.length ?? 0;

  // ── Pass 1: top-K nearest per city ────────────────────────────────────────
  const nearest: { idx: number; dist: number }[][] = new Array(N);
  for (let i = 0; i < N; i++) {
    const ei = embs[i]!;
    const heap: { idx: number; dist: number }[] = [];
    let worstIdx = -1;
    let worstDist = -1;
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const ej = embs[j]!;
      let d2 = 0;
      for (let k = 0; k < D; k++) {
        const diff = ei[k]! - ej[k]!;
        d2 += diff * diff;
      }
      const d = Math.sqrt(d2);
      if (heap.length < TOP_K) {
        heap.push({ idx: j, dist: d });
        if (d > worstDist) { worstDist = d; worstIdx = heap.length - 1; }
      } else if (d < worstDist) {
        heap[worstIdx] = { idx: j, dist: d };
        // Find new worst
        worstDist = -1; worstIdx = -1;
        for (let h = 0; h < heap.length; h++) {
          if (heap[h]!.dist > worstDist) { worstDist = heap[h]!.dist; worstIdx = h; }
        }
      }
    }
    heap.sort((x, y) => x.dist - y.dist);
    nearest[i] = heap;
  }

  // ── Twins: pairs of mutual neighbors from DIFFERENT countries, FAR apart ─
  const seen = new Set<string>();
  const allTwins: Twin[] = [];
  for (let i = 0; i < N; i++) {
    const a = valid[i]!;
    const ccA = (a as any).countryCode ?? '';
    for (const n of nearest[i]!) {
      const j = n.idx;
      if (j === i) continue;
      const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const b = valid[j]!;
      const ccB = (b as any).countryCode ?? '';
      if (ccA && ccB && ccA === ccB) continue;
      const geoKm = haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
      if (geoKm < 2000) continue; // require physically far apart
      allTwins.push({ a, b, embeddingDist: n.dist, geoKm });
    }
  }
  // Rank: low embeddingDist first; tie-break by larger geoKm (more surprising)
  allTwins.sort((x, y) => x.embeddingDist - y.embeddingDist || y.geoKm - x.geoKm);
  const twins = allTwins.slice(0, 50);

  // ── Loneliest cuisines: highest distance-to-nearest ──────────────────────
  const loneliest = valid
    .map((p, i) => ({
      place: p as Place,
      nearestDist: nearest[i]![0]!.dist,
      nearestCity: valid[nearest[i]![0]!.idx]! as Place,
    }))
    .sort((a, b) => b.nearestDist - a.nearestDist)
    .slice(0, 50);

  // ── Country diversity: mean pairwise distance within each country ────────
  const byCountry = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const cc = (valid[i]! as any).countryCode ?? '';
    if (!cc) continue;
    if (!byCountry.has(cc)) byCountry.set(cc, []);
    byCountry.get(cc)!.push(i);
  }
  const countryDiversity: CountryDiversity[] = [];
  for (const [cc, idxs] of byCountry.entries()) {
    if (idxs.length < 5) continue; // need enough cities to be meaningful
    // Sample up to 30 cities for the pairwise calculation to keep it cheap
    const sampled = idxs.length <= 30 ? idxs : idxs.slice(0, 30);
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < sampled.length; i++) {
      const ei = embs[sampled[i]!]!;
      for (let j = i + 1; j < sampled.length; j++) {
        const ej = embs[sampled[j]!]!;
        let d2 = 0;
        for (let k = 0; k < D; k++) {
          const diff = ei[k]! - ej[k]!;
          d2 += diff * diff;
        }
        sum += Math.sqrt(d2);
        pairs++;
      }
    }
    countryDiversity.push({
      countryCode: cc,
      cityCount: idxs.length,
      meanIntraDistance: pairs > 0 ? sum / pairs : 0,
    });
  }
  countryDiversity.sort((a, b) => b.meanIntraDistance - a.meanIntraDistance);

  // ── Global ingredient list sorted by world-frequency ─────────────────────
  const ingFreq = new Map<string, number>();
  for (const p of valid) {
    const ings = (p as any).ingredients as Record<string, number> | undefined;
    if (!ings) continue;
    for (const [k, v] of Object.entries(ings)) {
      if (typeof v === 'number' && v > 0.5) {
        ingFreq.set(k, (ingFreq.get(k) ?? 0) + 1);
      }
    }
  }
  const globalIngredients = [...ingFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  return {
    twins,
    loneliest,
    countryDiversity,
    globalIngredients,
    topNearestPerCity: nearest,
    validPlaces: valid as Place[],
  };
}

// Top cities for a given ingredient
export function citiesForIngredient(
  places: Place[],
  ingredient: string,
  limit = 25,
): { place: Place; score: number }[] {
  const out: { place: Place; score: number }[] = [];
  for (const p of places) {
    const v = (p as any).ingredients?.[ingredient];
    if (typeof v === 'number' && v > 0) out.push({ place: p, score: v });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// Find the shortest culinary path between two cities using BFS on the kNN graph
export function findCulinaryPath(
  stats: DiscoveryStats,
  fromId: string,
  toId: string,
): PathHop[] | null {
  const valid = stats.validPlaces as (Place & { id?: string })[];
  const fromIdx = valid.findIndex((p) => (p as any).id === fromId);
  const toIdx = valid.findIndex((p) => (p as any).id === toId);
  if (fromIdx < 0 || toIdx < 0) return null;

  // BFS to find shortest hop path
  const queue: number[] = [fromIdx];
  const parent = new Map<number, number>();
  parent.set(fromIdx, -1);
  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === toIdx) { found = true; break; }
    for (const n of stats.topNearestPerCity[cur]!) {
      if (parent.has(n.idx)) continue;
      parent.set(n.idx, cur);
      queue.push(n.idx);
    }
    if (parent.size > 2000) break; // safety
  }
  if (!found) return null;

  // Trace back
  const path: PathHop[] = [];
  let cur = toIdx;
  while (cur !== -1) {
    const prev = parent.get(cur)!;
    const dist = prev === -1 ? 0 :
      stats.topNearestPerCity[prev]!.find((n) => n.idx === cur)?.dist ?? 0;
    path.push({ place: valid[cur]!, hopDist: dist });
    cur = prev;
  }
  path.reverse();
  return path;
}
