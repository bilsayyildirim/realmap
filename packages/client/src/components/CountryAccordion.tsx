import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
} from '@mui/material';
import { ICity } from 'country-state-city';
import * as React from 'react';
import { FeatureName, FeatureType, PlaceFeatures } from '../types/features';
import { CityAccordion } from './CityAccordion';

interface CountryAccordionProps {
  country: string;
  cities: Record<string, ICity[]>;
  features: Record<string, PlaceFeatures>;
  onFeatureChange: (
    placeId: string,
    featureType: FeatureType,
    featureName: FeatureName,
  ) => (event: Event, value: number | number[]) => void;
}

export const CountryAccordion: React.FC<CountryAccordionProps> = ({
  country,
  cities,
  features,
  onFeatureChange,
}: CountryAccordionProps) => {
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>{country}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {Object.entries(cities).map(([city, cityPlaces]) => (
          <CityAccordion
            key={`${country}-${city}`}
            city={city}
            cities={cityPlaces}
            features={features}
            onFeatureChange={onFeatureChange}
          />
        ))}
      </AccordionDetails>
    </Accordion>
  );
};
