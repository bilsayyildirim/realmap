import PublicIcon from '@mui/icons-material/Public';
import { IconButton } from '@mui/material';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { CityDrawer } from './CityDrawer';
import { PlacesLayer } from './PlacesLayer';
import { SearchBar } from './SearchBar';

const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY as string | undefined;
const TILE_URL = STADIA_KEY
  ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key=${STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png';

interface MapProps {
  center: [number, number];
  zoom: number;
}

export const Map = ({ center, zoom }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);

  const [showPlaces, setShowPlaces] = useState(false);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'raster-tiles': {
              type: 'raster',
              tiles: [TILE_URL],
              tileSize: 256,
              attribution: '© Stadia Maps, © OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'simple-tiles', type: 'raster', source: 'raster-tiles', minzoom: 0, maxzoom: 22 }],
        },
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

      {showPlaces && map.current && (
        <>
          <PlacesLayer map={map.current} onCitySelect={setSelectedCityName} />
          <SearchBar map={map.current} onCitySelect={setSelectedCityName} />

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

      <CityDrawer cityName={selectedCityName} onClose={() => setSelectedCityName(null)} />
    </>
  );
};
