import maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { usePlaces } from '../hooks/usePlaces';
import { preloadColorCalibration } from '../utils/colorUtils';
import {
  createPlaceFeature,
  initHexLayer,
  initializeMapLayers,
  initTagLayer,
  initVoronoiLayer,
  setTagsVisible,
  updateGlowSource,
  updateHeatmapSource,
  updateMapSource,
  updateTagSource,
  updateVoronoiSource,
} from '../utils/mapUtils';
import { computeRegionTags, computeSelectedTags } from '../utils/regionTags';

interface PlacesLayerProps {
  map: maplibregl.Map;
  onCitySelect: (cityId: string) => void;
  onHexReady?: () => void;
  discoverOpen: boolean;
  selectedItems: Set<string>;
  thresholds: Map<string, number>;
}

export const PlacesLayer = ({
  map,
  onCitySelect,
  onHexReady,
  discoverOpen,
  selectedItems,
  thresholds,
}: PlacesLayerProps) => {
  const { places, loading, error } = usePlaces();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize map layers once data is ready
  useEffect(() => {
    if (!places || error || loading) return;
    if (isInitialized) return;

    const initLayers = () => {
      if (!map.isStyleLoaded()) {
        map.once('styledata', initLayers);
        return;
      }
      try {
        initializeMapLayers(map);
        initVoronoiLayer(map);
        initTagLayer(map);
        // Tags hidden by default; shown only when Discover is open.
        setTagsVisible(map, false);
        void initHexLayer(map).then(() => onHexReady?.());

        map.on('click', 'places', (e: maplibregl.MapLayerMouseEvent) => {
          e.originalEvent?.stopPropagation();
          const id = e.features?.[0]?.properties?.id;
          if (id) onCitySelect(id);
        });
        map.on('mouseenter', 'places', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'places', () => { map.getCanvas().style.cursor = ''; });

        setIsInitialized(true);
      } catch (e) {
        console.error('Error initializing map layers:', e);
      }
    };

    initLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, places, loading, error]);

  // Update map source whenever places load
  useEffect(() => {
    if (!isInitialized || !map || loading || error) return;

    const update = async () => {
      try {
        await preloadColorCalibration();
      } catch (e) {
        console.error('Failed to preload color calibration:', e);
        return;
      }

      const features = places
        .map(createPlaceFeature)
        .filter((f): f is NonNullable<typeof f> => f !== null);
      if (features.length === 0) return;

      await updateMapSource(map, 'places', features);
      updateGlowSource(map, features);
      updateVoronoiSource(map, features);
      if (places) await updateHeatmapSource(map, places);
    };

    if (map.isStyleLoaded()) {
      update();
    } else {
      const onStyle = () => {
        update();
        map.off('styledata', onStyle);
      };
      map.on('styledata', onStyle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, map, loading, error, isInitialized]);

  // Tag layer: visibility tracks Discover drawer. When chips are selected,
  // paint only those labels at the regions where each item is strong.
  // Otherwise show the normal TF-IDF region tags.
  useEffect(() => {
    if (!isInitialized || !map || !places || loading || error) return;

    setTagsVisible(map, discoverOpen);

    if (!discoverOpen) return;

    const tags = selectedItems.size > 0
      ? computeSelectedTags(places, selectedItems, thresholds)
      : computeRegionTags(places);
    updateTagSource(map, tags);
  }, [discoverOpen, selectedItems, thresholds, places, map, loading, error, isInitialized]);

  return null;
};
