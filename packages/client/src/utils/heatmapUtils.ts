// heatmapUtils.ts – Heatmap-style gradient visualization utilities
// ---------------------------------------------------------------------------------
// Creates interpolated color surfaces from point data for gradient visualization
// ---------------------------------------------------------------------------------

import { Feature, Point } from 'geojson';
import chroma from 'chroma-js';

interface ColorPoint {
  lng: number;
  lat: number;
  color: string; // hex color
  weight?: number; // optional weight for interpolation
}

/**
 * Creates a grid of interpolated color points for heatmap visualization
 * using perceptual OKLab blending (weighted average in OKLab coordinates).
 */
export function createInterpolatedGrid(
  points: ColorPoint[],
  gridSize: number = 50,
  radius: number = 0.6,
  power: number = 2,
): Feature<Point>[] {
  if (points.length === 0) return [];

  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const padding = radius * 0.5;
  const lngRange = maxLng - minLng + padding * 2;
  const latRange = maxLat - minLat + padding * 2;
  const lngStep = lngRange / gridSize;
  const latStep = latRange / gridSize;

  const gridFeatures: Feature<Point>[] = [];
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const gridLng = minLng - padding + i * lngStep;
      const gridLat = minLat - padding + j * latStep;
      const color = interpolateColorOkLab(gridLng, gridLat, points, radius, power);
      if (!color) continue;
      gridFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [gridLng, gridLat] },
        properties: { color, intensity: 1 },
      });
    }
  }
  return gridFeatures;
}

function interpolateColorOkLab(
  lng: number,
  lat: number,
  points: ColorPoint[],
  radius: number,
  power: number,
): string | null {
  let totalWeight = 0;
  let Lsum = 0;
  let asum = 0;
  let bsum = 0;

  for (const point of points) {
    const distance = haversineDistance(lat, lng, point.lat, point.lng);
    if (distance > radius) continue;
    const weight = point.weight ?? 1;
    const idwWeight = weight / Math.pow(distance + 0.001, power);
    if (!(idwWeight > 0)) continue;
    const [L, a, b] = chroma(point.color).oklab();
    Lsum += L * idwWeight;
    asum += a * idwWeight;
    bsum += b * idwWeight;
    totalWeight += idwWeight;
  }

  if (totalWeight <= 0) return null;
  const L = Lsum / totalWeight;
  const a = asum / totalWeight;
  const b = bsum / totalWeight;

  // Keep lightness/chroma stable while finding in-gamut OKLCH chroma.
  const base = chroma.oklab(L, a, b);
  const [oL, oC, oH] = base.oklch();
  if (!base.clipped()) return base.hex();
  let lo = 0;
  let hi = Math.max(0, oC);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const c = chroma.oklch(oL, mid, oH);
    if (c.clipped()) hi = mid;
    else lo = mid;
  }
  return chroma.oklch(oL, lo, oH).hex();
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c) / 111;
}

/**
 * Alternative: Create a simpler heatmap using larger blurred circles
 * This is more performant and works well for dense point clouds
 */
export function createBlurredHeatmapFeatures(
  points: ColorPoint[],
  baseRadius: number = 15, // base radius in pixels (reduced from 20)
  blurRadius: number = 25, // blur radius in pixels (reduced from 30)
): Feature<Point>[] {
  return points.map((point) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [point.lng, point.lat],
    },
    properties: {
      color: point.color,
      radius: baseRadius,
      blur: blurRadius,
      intensity: point.weight ?? 1,
    },
  }));
}

