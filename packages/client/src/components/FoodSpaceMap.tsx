import { Box, Typography } from '@mui/material';
// @ts-ignore
import { Place } from '@realmap/shared';
import { useEffect, useRef, useState } from 'react';
import { usePlaces } from '../hooks/usePlaces';
import { getCityColor, preloadColorCalibration } from '../utils/colorUtils';
import { CityDrawer } from './CityDrawer';

interface FoodSpaceMapProps {
  open: boolean;
}

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

interface TooltipState {
  x: number;
  y: number;
  name: string;
  country: string;
}

// Scale a value from [inMin, inMax] to [outMin, outMax]
function scaleLinear(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  return ((v - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

export const FoodSpaceMap = ({ open }: FoodSpaceMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { places, loading } = usePlaces();
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  // stable refs so event handlers don't go stale
  const transformRef = useRef(transform);
  const placesRef = useRef<Place[]>([]);
  const boundsRef = useRef({ minX: -1, maxX: 1, minY: -1, maxY: 1 });

  // Preload calibration once
  useEffect(() => {
    preloadColorCalibration().then(() => setReady(true)).catch(() => setReady(true));
  }, []);

  // Sync transform ref
  useEffect(() => { transformRef.current = transform; }, [transform]);

  // Compute bounds and cache places
  useEffect(() => {
    if (!places.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of places) {
      const h = (p as any).hue2d as number[] | undefined;
      if (!h || h.length < 2) continue;
      if (h[0] < minX) minX = h[0];
      if (h[0] > maxX) maxX = h[0];
      if (h[1] < minY) minY = h[1];
      if (h[1] > maxY) maxY = h[1];
    }
    if (minX === Infinity) return;
    const pad = 0.06;
    const rx = (maxX - minX) * pad, ry = (maxY - minY) * pad;
    boundsRef.current = { minX: minX - rx, maxX: maxX + rx, minY: minY - ry, maxY: maxY + ry };
    placesRef.current = places;
  }, [places]);

  // Draw whenever open, transform, places or ready changes
  useEffect(() => {
    if (!open || !ready || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const { minX, maxX, minY, maxY } = boundsRef.current;
    const { scale, tx, ty } = transformRef.current;

    for (const p of placesRef.current) {
      const h = (p as any).hue2d as number[] | undefined;
      if (!h || h.length < 2) continue;

      // Base canvas coords (before pan/zoom)
      const bx = scaleLinear(h[0], minX, maxX, 0, W);
      const by = scaleLinear(h[1], maxY, minY, 0, H); // invert Y so positive is up

      // Apply transform
      const sx = bx * scale + tx;
      const sy = by * scale + ty;

      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;

      const color = getCityColor(p);
      const r = Math.max(2, 3 * Math.min(scale, 3));

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, [open, ready, transform, places]);

  // Resize canvas when container size changes
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      setTransform((t) => ({ ...t })); // trigger redraw
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [open]);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const canvasToPlace = (cx: number, cy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { scale, tx, ty } = transformRef.current;
    const { minX, maxX, minY, maxY } = boundsRef.current;
    const W = canvas.width, H = canvas.height;
    let closest: Place | null = null;
    let minDistSq = 400; // 20px screen-radius hit target, constant regardless of zoom

    for (const p of placesRef.current) {
      const h = (p as any).hue2d as number[] | undefined;
      if (!h || h.length < 2) continue;
      const bx = scaleLinear(h[0], minX, maxX, 0, W);
      const by = scaleLinear(h[1], maxY, minY, 0, H);
      const sx = bx * scale + tx;
      const sy = by * scale + ty;
      const dx = cx - sx, dy = cy - sy;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDistSq) { minDistSq = d2; closest = p; }
    }
    return closest;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { scale, tx, ty } = transformRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.3, Math.min(30, scale * factor));
    setTransform({
      scale: newScale,
      tx: mx - (mx - tx) * (newScale / scale),
      ty: my - (my - ty) * (newScale / scale),
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setTransform((t) => ({ ...t, tx: t.tx + dx, ty: t.ty + dy }));
      setTooltip(null);
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const p = canvasToPlace(cx, cy);
    if (p) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        name: p.name,
        country: (p as any).country ?? p.countryCode ?? '',
      });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseUp = () => { dragging.current = false; };

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const p = canvasToPlace(e.clientX - rect.left, e.clientY - rect.top);
    if (p) setSelectedCity(p.name);
  };

  if (!open) return null;

  return (
    <Box sx={{
      position: 'fixed', inset: 0,
      bgcolor: 'rgba(5,5,15,0.97)',
      zIndex: 1100,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <Box sx={{ px: 3, pt: 2.5, pb: 1, flexShrink: 0 }}>
        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500, letterSpacing: 0.3 }}>
          Food Culture Space
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
          City position = culinary similarity · Color = same as map · Scroll to zoom · Drag to pan
        </Typography>
      </Box>

      {/* Canvas */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)' }}>Loading cities…</Typography>
          </Box>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: tooltip ? 'pointer' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
        />

        {/* Tooltip */}
        {tooltip && (
          <Box sx={{
            position: 'absolute',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            bgcolor: 'rgba(10,10,22,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 1,
            px: 1.5, py: 0.75,
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
          }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
              {tooltip.name}
            </Typography>
            {tooltip.country && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                {tooltip.country}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <CityDrawer cityName={selectedCity} onClose={() => setSelectedCity(null)} />
    </Box>
  );
};
