import PublicIcon from '@mui/icons-material/Public';
import { IconButton } from '@mui/material';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { CityDrawer } from './CityDrawer';
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

  useEffect(() => {
    if (!mapContainer.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE_URL,
        center,
        zoom,
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
          <PlacesLayer map={map.current} onCitySelect={setSelectedCityId} onHexReady={() => setHexReady(true)} />
          <SearchBar map={map.current} onCitySelect={setSelectedCityId} />

          <IconButton
            onClick={() => map.current?.flyTo({ center: [0, 20], zoom: 1.5, duration: 1400, essential: true })}
            size="small"
            title="Reset view"
            sx={{
              position: 'fixed', bottom: 24, right: 12,
              bgcolor: 'rgba(10,10,22,0.82)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.55)',
              '&:hover': { bgcolor: 'rgba(20,20,40,0.92)', color: 'white' },
            }}
          >
            <PublicIcon fontSize="small" />
          </IconButton>
        </>
      )}

      <CityDrawer cityId={selectedCityId} onClose={() => setSelectedCityId(null)} />
    </>
  );
};
