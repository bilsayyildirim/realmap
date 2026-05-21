// mapUtils.ts — client‑side map utilities for RealMap
// ---------------------------------------------------------------------------------
// Handles GeoJSON feature creation and map source updates.
// • Creates GeoJSON features from Place objects
// • Per-point colors from getCityColor(embedding) + global_color_calibration.json
// ---------------------------------------------------------------------------------

/* eslint‑disable @typescript-eslint/ban‑ts‑comment */
import { Feature, Geometry } from 'geojson';
import maplibregl from 'maplibre-gl';
// @ts-ignore – Place interface lives in shared package
import { Place } from '@realmap/shared';
// @ts-ignore – d3-geo-voronoi is ESM-only, no types
import { geoVoronoi } from 'd3-geo-voronoi';
import { getCityColor } from './colorUtils';
import { createBlurredHeatmapFeatures } from './heatmapUtils';

// ---------------------------------------------------------------------------------
// Constants & module‑level caches
// ---------------------------------------------------------------------------------

let cachedColorMatch: any[] | null = null;

// ---------------------------------------------------------------------------------
// Public helper: create a GeoJSON Feature from a Place
// ---------------------------------------------------------------------------------
export function createPlaceFeature(place: Place): Feature | null {
  if (typeof place.longitude !== 'number' || typeof place.latitude !== 'number')
    return null;
  const geometry: Geometry = {
    type: 'Point',
    coordinates: [Number(place.longitude), Number(place.latitude)],
  };

  const feature = {
    type: 'Feature' as const,
    geometry,
    properties: {
      ...place,
      embedding: place.embedding,
      color: place.color,
    },
  };

  return feature;
}

// ---------------------------------------------------------------------------------
// Main entry: push newFeatures into MapLibre source with pre-computed colours
// ---------------------------------------------------------------------------------
export async function updateMapSource(
  map: maplibregl.Map,
  sourceId: string,
  newFeatures: Feature[],
): Promise<void> {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource;
  if (!src) return console.error('Source not found', sourceId);

  // Merge by stable key to avoid dups but preserve distinct cities
  const existing = ((await src.getData()) as any).features ?? [];
  const byKey = new Map<string, Feature>();
  [...existing, ...newFeatures].forEach((f) => {
    const props = f.properties as any;
    const key =
      props.id ??
      props.slug ??
      `${props.latitude}|${props.longitude}|${props.name ?? ''}`;
    byKey.set(key, f);
  });

  // Recompute colors per city using embedding-based calibration (no cluster bias)
  // smoothAndNudgeColors is intentionally skipped: it's O(n²) for n=6559 cities,
  // freezing the main thread for ~10s with no meaningful visual benefit
  // (the OKLCH pipeline already encodes culinary distance as color distance).
  const features = Array.from(byKey.values()).map((f) => {
    const props = f.properties as any;
    const color = getCityColor(props as Place);
    return {
      ...f,
      properties: {
        ...props,
        color,
      },
    } as Feature;
  });
  src.setData({ type: 'FeatureCollection', features });

  // Reset color cache when new features come in
  cachedColorMatch = null;

  // -------------------------------- per-city colours --------------------------------
  if (!cachedColorMatch) {
    // Simple data‑driven color: read hex from the 'color' property
    cachedColorMatch = ['get', 'color'];
    console.log('Using per-city color from feature properties.');
  }

  if (map.getLayer('places')) {
    map.setPaintProperty('places', 'circle-color', 'rgba(0,0,0,0)');
    map.setPaintProperty('places', 'circle-stroke-color', cachedColorMatch);
    console.log('Applied outline color paint property');
  }
}

// ---------------------------------------------------------------------------------
// One‑shot helper to create baseline layers (idempotent)
// ---------------------------------------------------------------------------------
export function initializeMapLayers(map: maplibregl.Map): void {
  // Ensure map is loaded before accessing sources
  if (!map || !map.isStyleLoaded()) {
    console.warn('Map not ready, deferring layer initialization');
    return;
  }

  try {
    if (!map.getSource('places')) {
    map.addSource('places', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('places')) {
    map.addLayer({
      id: 'places',
      type: 'circle',
      source: 'places',
      minzoom: 9,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          9, 3,
          12, 6,
          15, 10,
        ],
        'circle-opacity': 0.9,
        'circle-stroke-color': 'rgba(0,0,0,0.35)',
        'circle-stroke-width': 1.5,
      },
    });
  }

  // Add heatmap source and layer (hidden by default)
  if (!map.getSource('places-heatmap')) {
    map.addSource('places-heatmap', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('places-heatmap')) {
    map.addLayer({
      id: 'places-heatmap',
      type: 'circle',
      source: 'places-heatmap',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 12, // min zoom: 12px (reduced from 15)
          10, 30, // max zoom: 30px (reduced from 40)
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.4, // reduced from 0.6 for less intensity
        'circle-blur': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 1.2, // more blur at low zoom (increased from 0.8)
          10, 0.6, // more blur at high zoom (increased from 0.3)
        ],
        'circle-stroke-width': 0,
      },
    });
    // Hide heatmap layer by default
    map.setLayoutProperty('places-heatmap', 'visibility', 'none');
  }

    console.info('Map layers ready ✔︎');
  } catch (error) {
    console.error('Error initializing map layers:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------------
// Toggle between point view and heatmap view
// ---------------------------------------------------------------------------------
export function setHeatmapMode(
  map: maplibregl.Map,
  enabled: boolean,
): void {
  const pointLayer = map.getLayer('places');
  const heatmapLayer = map.getLayer('places-heatmap');

  if (pointLayer) {
    map.setLayoutProperty(
      'places',
      'visibility',
      enabled ? 'none' : 'visible',
    );
  }
  if (heatmapLayer) {
    map.setLayoutProperty(
      'places-heatmap',
      'visibility',
      enabled ? 'visible' : 'none',
    );
  }
}

// ---------------------------------------------------------------------------------
// H3 hex grid — split into 6 chunks to stay within iOS WebGL index buffer limits
// ---------------------------------------------------------------------------------
const HEX_CHUNKS = 6;
let hexInitialized = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HEX_OPACITY: any = ['interpolate', ['linear'], ['zoom'], 1, 0.40, 3, 0.52, 5, 0.68, 8, 0.60, 11, 0.42, 14, 0.12];

export async function initHexLayer(map: maplibregl.Map): Promise<void> {
  try {
    if (hexInitialized || map.getSource('hex-source-0')) return;
  } catch {
    return;
  }
  hexInitialized = true;

  await Promise.all(
    Array.from({ length: HEX_CHUNKS }, async (_, i) => {
      try {
        const res = await fetch(`/data/hex_grid_${i}.json`);
        if (!res.ok) return;
        const geojson = await res.json();
        if (map.getSource(`hex-source-${i}`)) return;
        map.addSource(`hex-source-${i}`, { type: 'geojson', data: geojson });
        // Insert below 'water' so the CartoDB ocean polygon clips hex cells at the
        // coastline for free — zero extra data, pixel-perfect coastlines.
        const beforeId = map.getLayer('water') ? 'water' : 'places';
        map.addLayer(
          { id: `hex-fill-${i}`, type: 'fill', source: `hex-source-${i}`,
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': HEX_OPACITY } },
          beforeId,
        );
      } catch {
        // chunk unavailable, skip
      }
    })
  );
}

export function setHexMode(map: maplibregl.Map, enabled: boolean): void {
  try {
    if (!map.getLayer('hex-fill')) return;
    for (let i = 0; i < HEX_CHUNKS; i++) {
      if (map.getLayer(`hex-fill-${i}`))
        map.setLayoutProperty(`hex-fill-${i}`, 'visibility', enabled ? 'visible' : 'none');
    }
  } catch {
    // map may be mid-teardown during HMR
  }
}

// ---------------------------------------------------------------------------------
// Glow layer — large blurred circles behind each city dot giving a soft color
// territory feel without coloring seas (contrast with Voronoi which fills ocean).
// ---------------------------------------------------------------------------------
let glowInitialized = false;

export function initGlowLayer(map: maplibregl.Map): void {
  if (glowInitialized) return;
  try {
    if (map.getSource('places-glow')) return;
  } catch {
    return;
  }
  glowInitialized = true;

  map.addSource('places-glow', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer(
    {
      id: 'places-glow',
      type: 'circle',
      source: 'places-glow',
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          1, 12,
          4, 20,
          7, 30,
          9, 18,
          11, 0,
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          1, 0.18,
          4, 0.22,
          7, 0.18,
          9, 0.10,
          11, 0.0,
        ],
        'circle-blur': 1.4,
        'circle-stroke-width': 0,
      },
    },
    'places',
  );
}

export function updateGlowSource(
  map: maplibregl.Map,
  features: Feature[],
): void {
  const src = map.getSource('places-glow') as maplibregl.GeoJSONSource;
  if (!src) return;

  const coloredFeatures = features.map((f) => {
    const props = f.properties as any;
    const color = props?.color ?? getCityColor(props as Place);
    return { ...f, properties: { ...props, color } };
  });

  src.setData({ type: 'FeatureCollection', features: coloredFeatures });
}

// ---------------------------------------------------------------------------------
// Voronoi layer — spherical Voronoi polygons fill each region with the color of
// the nearest city, giving a soft "territory" feel that fades out at high zoom.
// ---------------------------------------------------------------------------------
let voronoiInitialized = false;

export function initVoronoiLayer(map: maplibregl.Map): void {
  if (voronoiInitialized) return;
  try {
    if (map.getSource('voronoi')) return;
  } catch {
    return;
  }
  voronoiInitialized = true;

  map.addSource('voronoi', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer(
    {
      id: 'voronoi',
      type: 'fill',
      source: 'voronoi',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          1, 0.35,
          5, 0.20,
          9, 0.08,
          12, 0.0,
        ],
      },
    },
    'places',
  );
}

export function updateVoronoiSource(
  map: maplibregl.Map,
  features: Feature[],
): void {
  const src = map.getSource('voronoi') as maplibregl.GeoJSONSource;
  if (!src) return;

  if (features.length === 0) {
    src.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  try {
    const pointCollection = {
      type: 'FeatureCollection' as const,
      features: features.map((f) => ({
        ...f,
        properties: {
          ...(f.properties as any),
          color: (f.properties as any)?.color ?? getCityColor(f.properties as Place),
        },
      })),
    };

    const polygons = geoVoronoi(pointCollection).polygons();
    const coloredPolygons = {
      ...polygons,
      features: (polygons.features as any[]).map((f: any) => ({
        ...f,
        properties: {
          color: f.properties?.site?.properties?.color ?? '#666',
        },
      })),
    };
    src.setData(coloredPolygons);
  } catch (e) {
    console.warn('Voronoi generation failed:', e);
  }
}

// ---------------------------------------------------------------------------------
// Update heatmap source with blurred gradient circles
// ---------------------------------------------------------------------------------
export async function updateHeatmapSource(
  map: maplibregl.Map,
  places: Place[],
): Promise<void> {
  // Extract color points from places
  const colorPoints = places
    .map((place) => {
      if (
        typeof place.longitude !== 'number' ||
        typeof place.latitude !== 'number'
      )
        return null;

      const color = getCityColor(place);

      let weight = 1;
      return {
        lng: place.longitude,
        lat: place.latitude,
        color,
        weight,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Heatmap uses every city's improved color with blurred circles.
  const heatmapFeatures = createBlurredHeatmapFeatures(colorPoints, 12, 20);

  const src = map.getSource('places-heatmap') as maplibregl.GeoJSONSource;
  if (src) {
    src.setData({
      type: 'FeatureCollection',
      features: heatmapFeatures,
    });
  }
}
