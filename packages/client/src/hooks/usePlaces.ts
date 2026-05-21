import { Place } from '@realmap/shared';
import { useEffect, useState } from 'react';
import { dataUrl } from '../utils/dataUrl';

function cleanRecord<T extends Record<string, any>>(
  obj?: T,
): Record<string, number> | undefined {
  if (!obj) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out[k] = v;
    else if (typeof v === 'string' && !isNaN(Number(v))) out[k] = Number(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanEmbedding(v: unknown): number[] | undefined {
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'number')) return parsed;
    } catch { /* ignore */ }
  }
  return undefined;
}

// Module-level cache: shared across all hook instances so features.json is
// fetched exactly once per page load (it's ~8 MB with embeddings for 6500 cities).
let placesCache: Place[] | null = null;
let fetchPromise: Promise<Place[]> | null = null;

async function fetchPlacesOnce(): Promise<Place[]> {
  if (placesCache) return placesCache;
  const candidates = ['/data/features.json', '/src/data/features.json'];
  let arr: any[] | null = null;
  for (const path of candidates) {
    try {
      const url = await dataUrl(path);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const parsed = await res.json();
      if (Array.isArray(parsed)) { arr = parsed; break; }
    } catch { /* try next */ }
  }
  if (!arr) throw new Error('features.json unavailable');

  console.log('Loaded features.json:', {
    totalPlaces: arr.length,
    hasEmbedding: !!arr[0]?.embedding,
    embeddingLength: arr[0]?.embedding?.length,
  });

  const normalized = arr.map((p) => ({
    ...p,
    ingredients: cleanRecord(p.ingredients),
    cookingMethods: cleanRecord(p.cookingMethods),
    embedding: cleanEmbedding(p.embedding),
  })) as Place[];

  placesCache = normalized;
  return normalized;
}

export const usePlaces = () => {
  const [places, setPlaces] = useState<Place[]>(() => placesCache ?? []);
  const [loading, setLoading] = useState(() => placesCache === null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (placesCache !== null) return;
    if (!fetchPromise) fetchPromise = fetchPlacesOnce();

    let cancelled = false;
    fetchPromise
      .then((data) => { if (!cancelled) { setPlaces(data); setLoading(false); } })
      .catch((err) => {
        if (!cancelled) { setError(err as Error); setLoading(false); }
        fetchPromise = null; // allow retry on error
      });
    return () => { cancelled = true; };
  }, []);

  return { places, loading, error };
};
