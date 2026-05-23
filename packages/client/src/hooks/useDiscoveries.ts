// Lazily compute discovery stats on first request and cache module-wide.
// Used by the DiscoveriesPanel. The computation is ~1s for 5727 cities;
// triggered only when the user opens the panel for the first time.

import { useEffect, useState } from 'react';
import { computeDiscoveries, type DiscoveryStats } from '../utils/discoveryStats';
import { usePlaces } from './usePlaces';

let cache: DiscoveryStats | null = null;
let inflight: Promise<DiscoveryStats> | null = null;

function computeAsync(places: any[]): Promise<DiscoveryStats> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = new Promise((resolve) => {
    // Defer to next tick so the spinner can render
    setTimeout(() => {
      const stats = computeDiscoveries(places);
      cache = stats;
      inflight = null;
      resolve(stats);
    }, 0);
  });
  return inflight;
}

export function useDiscoveries(enabled: boolean) {
  const { places } = usePlaces();
  const [stats, setStats] = useState<DiscoveryStats | null>(cache);
  const [loading, setLoading] = useState(!cache && enabled);

  useEffect(() => {
    if (!enabled) return;
    if (cache) { setStats(cache); setLoading(false); return; }
    if (!places.length) return;
    setLoading(true);
    computeAsync(places).then((s) => { setStats(s); setLoading(false); });
  }, [enabled, places]);

  return { stats, loading };
}
