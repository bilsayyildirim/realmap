import { City, ICity } from 'country-state-city';
import { useEffect, useState } from 'react';

interface CityBatch {
  batch: number;
  cities: ICity[];
}

export const useCities = () => {
  const [latestBatch, setLatestBatch] = useState<CityBatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadCities = async () => {
      try {
        setIsLoading(true);
        const cities = City.getAllCities();

        // Process in batches of 1000
        const BATCH_SIZE = 1000;
        for (let i = 0; i < cities.length; i += BATCH_SIZE) {
          const batch = cities.slice(i, i + BATCH_SIZE);
          setLatestBatch({
            batch: Math.floor(i / BATCH_SIZE),
            cities: batch,
          });
          // Add a small delay between batches to prevent UI freezing
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        setIsLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to load cities'),
        );
        setIsLoading(false);
      }
    };

    loadCities();
  }, []);

  return {
    latestBatch,
    isLoading,
    error,
  };
};
