import chroma from 'chroma-js';
// @ts-ignore – Place interface lives in shared package
import type { Place } from '@realmap/shared';

// Color calibration (loaded from global_color_calibration.json)
export interface ColorCalibration {
  version: string;
  mu: number[]; // mean [12]
  sigma: number[]; // diagonal whitening [12] (sqrt of variance)
  B: number[][]; // 3D basis [3][12]
  quantiles: {
    u: { p02: number; p25?: number; p50?: number; p75?: number; p98: number };
    v: { p02: number; p25?: number; p50?: number; p75?: number; p98: number };
    w: { p02: number; p25?: number; p50?: number; p75?: number; p98: number };
  };
  // H: 512-point sorted angle CDF — histogram-equalized 2D UMAP angle
  angle_percentiles?: number[];
  // C: 512-point |wNorm| CDF — histogram-equalized PC3 magnitude
  w_abs_percentiles?: number[];
  // L: 512-point sqrt(uNorm²+vNorm²) CDF — histogram-equalized PCA(1,2) magnitude (v3+)
  uv_magnitude_percentiles?: number[];
  // Kept for backward compat / fallback only
  radius_percentiles?: number[];
  w_percentiles?: number[];
  u_percentiles?: number[];
  v_percentiles?: number[];
  hash: string;
}

let calibrationCache: ColorCalibration | null = null;
let calibrationLoadPromise: Promise<ColorCalibration | null> | null = null;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Load color calibration from global_color_calibration.json
async function loadCalibration(): Promise<ColorCalibration | null> {
  if (calibrationCache) return calibrationCache;
  if (calibrationLoadPromise) return calibrationLoadPromise;

  calibrationLoadPromise = (async () => {
    try {
      const response = await fetch('/data/global_color_calibration.json', { cache: 'no-store' });
      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Color calibration not found - colors will be incorrect!');
        }
        return null;
      }
      const cal = (await response.json()) as ColorCalibration;
      calibrationCache = cal;
      return cal;
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Failed to load color calibration:', e);
      }
      return null;
    }
  })();

  return calibrationLoadPromise;
}

/**
 * Preload color calibration before first map paint.
 * Call this at app startup and await it before rendering map points.
 *
 * @throws Error in development if calibration fails to load
 */
export async function preloadColorCalibration(): Promise<void> {
  const cal = await loadCalibration();
  if (!cal) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error('Color calibration failed to load - cannot render map colors correctly');
    }
    // In production, allow fallback but log warning
    console.warn('⚠️ Color calibration not available - using fallback colors');
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    try {
      const res = await fetch('/data/features_meta.json', { cache: 'no-store' });
      if (res.ok) {
        const meta = (await res.json()) as { calibrationHash?: string | null };
        const expected = meta.calibrationHash;
        if (
          typeof expected === 'string' &&
          expected.length > 0 &&
          expected !== cal.hash
        ) {
          throw new Error(
            `Calibration hash mismatch: global_color_calibration.json has ${cal.hash}, features_meta.json has ${expected}. Re-run build-clusters and copy artifacts.`,
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('mismatch')) {
        throw e;
      }
      // Missing features_meta in dev is OK (e.g. partial data dir)
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.groupCollapsed('🎨 Color calibration loaded — hash:', cal.hash);
    const q = cal.quantiles;
    console.log('Normalization mode:', q.u.p50 !== undefined ? 'MEDIAN-CENTERED (p50+IQR)' : 'LEGACY (p02/p98)');
    console.table({
      U: { p25: q.u.p25?.toFixed(3), p50: q.u.p50?.toFixed(3), p75: q.u.p75?.toFixed(3) },
      V: { p25: q.v.p25?.toFixed(3), p50: q.v.p50?.toFixed(3), p75: q.v.p75?.toFixed(3) },
      W: { p25: q.w.p25?.toFixed(3), p50: q.w.p50?.toFixed(3), p75: q.w.p75?.toFixed(3) },
    });
    console.log('angle_percentiles length:', cal.angle_percentiles?.length ?? 'none');
    console.groupEnd();
  }
}

// Map a raw angle in [0, 2π] to a uniform rank in [0, 2π] using histogram equalization.
// percentiles[i] = angle value at rank i/(N-1). Binary-search with linear interpolation.
function equalizeAngle(rawAngle: number, percentiles: number[]): number {
  const n = percentiles.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((percentiles[mid] ?? 0) < rawAngle) lo = mid + 1;
    else hi = mid;
  }
  // Linear interpolation between bracketing percentile entries for smooth output
  if (lo > 0 && lo < n) {
    const loVal = percentiles[lo - 1] ?? 0;
    const hiVal = percentiles[lo] ?? 0;
    const t = hiVal > loVal ? (rawAngle - loVal) / (hiVal - loVal) : 0;
    return ((lo - 1 + t) / (n - 1)) * 2 * Math.PI;
  }
  return (lo / (n - 1)) * 2 * Math.PI;
}

// Map a raw radius to uniform [0,1] rank using histogram equalization.
// Ensures full chroma range [0.12, 0.38] is utilized — without this, ~25% of
// cities cluster near the PCA center and get near-gray colors (C≈0.14).
function equalizeRadius(rawRadius: number, percentiles: number[]): number {
  const n = percentiles.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((percentiles[mid] ?? 0) < rawRadius) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && lo < n) {
    const loVal = percentiles[lo - 1] ?? 0;
    const hiVal = percentiles[lo] ?? 0;
    const t = hiVal > loVal ? (rawRadius - loVal) / (hiVal - loVal) : 0;
    return (lo - 1 + t) / (n - 1);
  }
  return lo / (n - 1);
}

// Map a signed float x to its percentile rank in [0, 1] using binary search + linear interp.
// Used for PC1→H and PC2→L in the 3-axis independent color mapping.
function equalizeSignedAxis(x: number, percentiles: number[]): number {
  const n = percentiles.length;
  if (x <= percentiles[0]!) return 0;
  if (x >= percentiles[n - 1]!) return 1;
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if ((percentiles[mid] ?? 0) <= x) lo = mid; else hi = mid;
  }
  const loVal = percentiles[lo]!;
  const hiVal = percentiles[hi]!;
  const t = hiVal > loVal ? (x - loVal) / (hiVal - loVal) : 0;
  return (lo + t) / (n - 1);
}

// Convert OKLCH to sRGB while preserving hue/lightness as much as possible.
// Strategy: keep L/H fixed, binary-search max in-gamut C.
function oklchInGamut(L: number, C: number, H: number) {
  const l = clamp(L, 0, 1);
  const h = ((H % 360) + 360) % 360;
  const candidate = chroma.oklch(l, C, h);
  if (!candidate.clipped()) return candidate;

  // Tier 1: preserve hue/lightness, compress chroma only.
  let lo = 0;
  let hi = Math.max(0, C);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const c = chroma.oklch(l, mid, h);
    if (c.clipped()) hi = mid;
    else lo = mid;
  }
  const tier1 = chroma.oklch(l, lo, h);
  if (!tier1.clipped()) return tier1;

  // Tier 2: tiny lightness pull toward mid while preserving hue.
  const l2 = clamp(0.85 * l + 0.15 * 0.62, 0, 1);
  lo = 0;
  hi = Math.max(0, C);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const c = chroma.oklch(l2, mid, h);
    if (c.clipped()) hi = mid;
    else lo = mid;
  }
  const tier2 = chroma.oklch(l2, lo, h);
  if (!tier2.clipped()) return tier2;

  // Tier 3: slight hue drift allowance if still clipped.
  const h3 = (h + 6) % 360;
  lo = 0;
  hi = Math.max(0, C);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const c = chroma.oklch(l2, mid, h3);
    if (c.clipped()) hi = mid;
    else lo = mid;
  }
  return chroma.oklch(l2, lo, h3);
}

/**
 * Compute color for a city based purely on embedding position.
 *
 * Rule: color = f(embedding) only. No cluster identity bias.
 *
 * Uses data-derived calibration:
 * 1. Center: e - mu
 * 2. Whiten: z = W * (e - mu)  (diagonal approximation)
 * 3. Project: (u,v,w) = B * z
 * 4. Robust normalize using quantiles → [-1,1]
 * 5. Map to OKLCH → sRGB
 *
 * This creates a continuous, perceptually uniform gradient that
 * reflects the true structure of the embedding space.
 */
export function getCityColor(
  place: Place | (Place & { cluster?: number }),
): string {
  const emb = Array.isArray((place as any).embedding)
    ? ((place as any).embedding as number[])
    : null;

  // Fallback if no embedding
  if (!emb || emb.length === 0) {
    return '#cccccc';
  }

  // Calibration must be preloaded - no fallback colors
  const cal = calibrationCache;
  if (!cal) {
    // In development, this should never happen (preloadColorCalibration should be called)
    if (process.env.NODE_ENV === 'development') {
      console.error('getCityColor called before calibration loaded - call preloadColorCalibration() first');
    }
    return '#cccccc'; // Gray fallback (not a real color, just placeholder)
  }

  const embDim = Math.min(emb.length, cal.mu.length, cal.sigma?.length ?? emb.length);

  // 1. Center: e - mu
  const centered = new Array(embDim);
  for (let d = 0; d < embDim; d++) {
    centered[d] = (emb[d] ?? 0) - (cal.mu[d] ?? 0);
  }

  // 2. Diagonal whitening: z = (e - mu) / sigma
  const whitened = new Array(embDim);
  for (let d = 0; d < embDim; d++) {
    const sigma = cal.sigma?.[d] ?? 1;
    whitened[d] = centered[d] / Math.max(1e-8, sigma);
  }

  // 3. Project: (u,v,w) = B * z
  let u = 0, v = 0, w = 0;
  for (let d = 0; d < embDim; d++) {
    u += whitened[d] * (cal.B[0]?.[d] ?? 0);
    v += whitened[d] * (cal.B[1]?.[d] ?? 0);
    w += whitened[d] * (cal.B[2]?.[d] ?? 0);
  }

  // 4. Normalize using p50-anchored asymmetric scaling → [-1,1]
  // Centers at the median so skewed distributions don't push dissimilar food
  // cultures into the same hue band (e.g., UK vs Turkey were identical before).
  // Uses the actual p02/p98 boundaries as ±1 limits — avoids harsh IQR clamping
  // that was putting 25% of cities at the lightness floor.
  const normalizeRobust = (
    val: number,
    axis: { p02: number; p25?: number; p50?: number; p75?: number; p98: number },
  ): number => {
    if (axis.p50 !== undefined) {
      const upScale = Math.max(1e-8, axis.p98 - axis.p50);
      const downScale = Math.max(1e-8, axis.p50 - axis.p02);
      const scale = val >= axis.p50 ? upScale : downScale;
      return clamp((val - axis.p50) / scale, -1, 1);
    }
    // Fallback: legacy range normalization
    const span = Math.max(1e-8, axis.p98 - axis.p02);
    return clamp((val - axis.p02) / span, 0, 1) * 2 - 1;
  };

  const uNorm = normalizeRobust(u, cal.quantiles.u);
  const vNorm = normalizeRobust(v, cal.quantiles.v);
  const wNorm = normalizeRobust(w, cal.quantiles.w);

  // 5. Map to OKLCH → sRGB
  // Hue + Chroma: from 2D color UMAP (hue2d [x, y] in ~unit circle).
  //   angle = atan2(y, x)+π → histogram-equalized → Hue
  //   radius = sqrt(x²+y²) → Chroma
  // Lightness: w axis from 12D PCA (computed above)
  //
  // hue2d is the primary source (features built with 2D color UMAP).
  // Fallbacks: hueAngle (old 1D rank builds), then PCA atan2 (legacy).
  // hue2d = [uNorm, vNorm] — deterministic PCA-normalized coordinates (no UMAP stochasticity).
  // angle = atan2(vNorm, uNorm) + π → histogram-equalized → Hue
  // radius = sqrt(uNorm² + vNorm²) → Chroma
  const hue2d = (place as any).hue2d as [number, number] | undefined;
  const precomputedHueAngle = (place as any).hueAngle as number | undefined;

  let rawHueAngle: number;

  if (hue2d !== undefined && hue2d.length === 2) {
    rawHueAngle = Math.atan2(hue2d[1]!, hue2d[0]!) + Math.PI; // [0, 2π]
  } else {
    rawHueAngle = precomputedHueAngle !== undefined
      ? precomputedHueAngle
      : Math.atan2(vNorm, uNorm) + Math.PI;
  }

  let H: number;
  let C: number;
  let L: number;

  // H: 2D UMAP angle, histogram-equalized → full [0°, 360°] hue spread.
  // 2D UMAP is used here (not PCA) because it spreads regional clusters via repulsion:
  // Milan vs Naples vs Palermo land at different angles even though their PCA projections
  // are nearly identical.
  if (cal.angle_percentiles && cal.angle_percentiles.length > 1) {
    H = (equalizeAngle(rawHueAngle, cal.angle_percentiles) * 180 / Math.PI) % 360;
  } else {
    H = (rawHueAngle * 180 / Math.PI) % 360;
  }

  // C: |PC3| of 12D structural embedding — independent of 2D UMAP layout.
  // NOT from 2D UMAP radius: tight clusters (all Japanese cities) collapse to the UMAP
  // center at radius≈0.04, making them near-gray even though Japanese cuisine is highly
  // distinctive. PC3 is orthogonal to the hue plane (u,v) and captures a real culinary
  // dimension — Japanese/Korean cities score high here (fermentation, umami, etc.).
  const chromaRank = cal.w_abs_percentiles && cal.w_abs_percentiles.length > 1
    ? equalizeSignedAxis(Math.abs(wNorm), cal.w_abs_percentiles)
    : Math.abs(wNorm);
  C = clamp(0.14 + 0.29 * chromaRank, 0.14, 0.43);

  // L: magnitude in (PC1, PC2) plane of 12D structural embedding.
  // sqrt(uNorm² + vNorm²) measures how far the city is from the global culinary mean
  // along the two dominant axes — distinctive cuisines (Japan, Ethiopia, Mexico) score
  // high → bright; mid-road cuisines score low → darker. Orthogonal to the H angle.
  const uvMagnitude = Math.sqrt(uNorm * uNorm + vNorm * vNorm);
  if (cal.uv_magnitude_percentiles && cal.uv_magnitude_percentiles.length > 1) {
    L = clamp(0.54 + 0.28 * equalizeRadius(uvMagnitude, cal.uv_magnitude_percentiles), 0.54, 0.82);
  } else {
    // Linear fallback: most cities have uvMagnitude in [0, 1.2]. Normalize by p90 ≈ 1.1.
    L = clamp(0.54 + 0.28 * Math.min(uvMagnitude / 1.1, 1.0), 0.54, 0.82);
  }

  const color = oklchInGamut(L, C, H);
  const rgb = color.rgb();
  if (rgb.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
    return '#cccccc';
  }

  const hex = color.hex();

  if (process.env.NODE_ENV === 'development') {
    const debugCities = new Set(['London','Istanbul','Paris','Tokyo','Lagos','Cairo','Mumbai','Beijing','Sydney','São Paulo','New York','Mexico City']);
    const cityName = (place as any).name as string | undefined;
    if (cityName && debugCities.has(cityName)) {
      console.log(
        `%c  ${cityName} `,
        `background:${hex};color:${L > 0.6 ? '#000' : '#fff'};padding:2px 6px;border-radius:3px;font-weight:bold`,
        `u=${uNorm.toFixed(2)} v=${vNorm.toFixed(2)} w=${wNorm.toFixed(2)}  raw_hue=${(rawHueAngle*180/Math.PI).toFixed(0)}°  eq_H=${H.toFixed(0)}°  L=${L.toFixed(2)} C=${C.toFixed(2)}  hex=${hex}`,
      );
    }
  }

  return hex;
}

