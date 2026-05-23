import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import { Box, Button, Dialog, IconButton, Typography } from '@mui/material';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaces } from '../hooks/usePlaces';
import {
  computeItemCatalog,
  computeItemThresholds,
  placeMatches,
} from '../utils/filterUtils';
import { CityDrawer } from './CityDrawer';
import { DiscoverDrawer } from './DiscoverDrawer';
import { PlacesLayer } from './PlacesLayer';
import { SearchBar } from './SearchBar';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface MapProps {
  center: [number, number];
  zoom: number;
}

export const Map = ({ center, zoom }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);

  const [showPlaces, setShowPlaces] = useState(false);
  const [hexReady, setHexReady] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const { places } = usePlaces();

  const catalog = useMemo(() => computeItemCatalog(places ?? []), [places]);
  const thresholds = useMemo(() => computeItemThresholds(places ?? []), [places]);
  const matchCount = useMemo(() => {
    if (!places || selectedItems.size === 0) return 0;
    let n = 0;
    for (const p of places) if (placeMatches(p, selectedItems, thresholds)) n++;
    return n;
  }, [places, selectedItems, thresholds]);

  useEffect(() => {
    if (!mapContainer.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE_URL,
        center,
        zoom,
        attributionControl: false,
      });

      map.current.on('load', () => {
        if (mapLoadedRef.current) return;
        if (map.current?.isStyleLoaded()) {
          mapLoadedRef.current = true;
          setShowPlaces(true);
        }
      });

      map.current.on('error', (e) => console.error(e.error));

      return () => {
        map.current?.remove();
        map.current = null;
      };
    } catch (error) {
      console.error(error);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [center, zoom]);

  const toggleItem = (key: string) => {
    setSelectedItems((prev) => (prev.has(key) ? new Set() : new Set([key])));
  };

  const handleDiscoverClose = () => {
    setDiscoverOpen(false);
    setSelectedItems(new Set());
  };

  return (
    <>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {!hexReady && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 9999,
          background: 'linear-gradient(90deg, #6366f1, #a78bfa, #6366f1)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite linear',
        }} />
      )}

      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>

      {showPlaces && map.current && (
        <>
          <PlacesLayer
            map={map.current}
            onCitySelect={setSelectedCityId}
            onHexReady={() => setHexReady(true)}
            discoverOpen={discoverOpen}
            selectedItems={selectedItems}
            thresholds={thresholds}
          />
          <SearchBar map={map.current} onCitySelect={setSelectedCityId} />

          {/* Discover button (bottom-center) */}
          <Button
            onClick={() => setDiscoverOpen(true)}
            startIcon={<TuneIcon fontSize="small" />}
            sx={{
              position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)',
              bgcolor: 'rgba(10,10,22,0.82)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.85)',
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.3,
              borderRadius: 999,
              px: 2.2, py: 0.7,
              minWidth: 0,
              '&:hover': { bgcolor: 'rgba(20,20,40,0.92)', color: 'white' },
              display: discoverOpen ? 'none' : 'inline-flex',
            }}
          >
            Discover
          </Button>

          <IconButton
            onClick={() => setHelpOpen(true)}
            size="small"
            title="What is this?"
            sx={{
              position: 'fixed', bottom: 24, right: 12,
              bgcolor: 'rgba(10,10,22,0.82)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.55)',
              '&:hover': { bgcolor: 'rgba(20,20,40,0.92)', color: 'white' },
            }}
          >
            <HelpOutlineIcon fontSize="small" />
          </IconButton>

          <DiscoverDrawer
            open={discoverOpen}
            onClose={handleDiscoverClose}
            catalog={catalog}
            selected={selectedItems}
            onToggle={toggleItem}
            onClear={() => setSelectedItems(new Set())}
            matchCount={matchCount}
          />
        </>
      )}

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'rgba(18,18,30,0.98)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: '#eee',
            borderRadius: 3,
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          },
        }}
      >
        <Box sx={{ position: 'relative', px: 3, pt: 2.5, pb: 2.5 }}>
          <IconButton
            onClick={() => setHelpOpen(false)}
            size="small"
            sx={{ position: 'absolute', top: 8, right: 8, color: '#666', '&:hover': { color: '#eee' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          <Typography sx={{ fontSize: 16, fontWeight: 600, color: '#fff', mb: 1.5 }}>
            What is this?
          </Typography>

          <Typography sx={{ fontSize: 13, color: '#ccc', lineHeight: 1.55, mb: 2 }}>
            A map of how the world eats. Each city's color reflects what people actually cook
            and eat there — same colors mean similar cuisines. Cities cluster by genuine
            culinary kinship, not by country borders or politics. The map paints itself
            from food data alone.
          </Typography>

          <Typography sx={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#666', mb: 0.8 }}>
            Method
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, '& li': { fontSize: 12, color: '#aaa', lineHeight: 1.7 } }}>
            <li>
              <strong style={{ color: '#ddd' }}>364-D city vectors</strong> — ingredient & cooking-method scores per city
            </li>
            <li>
              <strong style={{ color: '#ddd' }}>KernelPCA (cosine)</strong> — distance-preserving projection to 3D
            </li>
            <li>
              <strong style={{ color: '#ddd' }}>OKLCH</strong> — perceptually uniform color mapping
            </li>
            <li>
              <strong style={{ color: '#ddd' }}>H3 resolution 4</strong> — hexagonal grid (~22 km cells)
            </li>
            <li>
              <strong style={{ color: '#ddd' }}>Gaussian blend σ=50 km</strong> — smooth local gradients
            </li>
          </Box>

          <Typography sx={{ fontSize: 10, color: '#444', mt: 2.2, lineHeight: 1.5 }}>
            Map: © CARTO, © OpenStreetMap contributors.
          </Typography>
        </Box>
      </Dialog>

      <CityDrawer cityId={selectedCityId} onClose={() => setSelectedCityId(null)} />
    </>
  );
};
