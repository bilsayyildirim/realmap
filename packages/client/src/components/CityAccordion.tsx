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
import { PlaceAccordion } from './PlaceAccordion';

interface CityAccordionProps {
  city: string;
  cities: ICity[];
  features: Record<string, PlaceFeatures>;
  onFeatureChange: (
    placeId: string,
    featureType: FeatureType,
    featureName: FeatureName,
  ) => (event: Event, value: number | number[]) => void;
}

export const CityAccordion: React.FC<CityAccordionProps> = ({
  city,
  cities,
  features,
  onFeatureChange,
}: CityAccordionProps) => {
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>{city}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {cities.map((place) => (
          <PlaceAccordion
            key={`${place.name}-${place.stateCode}-${place.countryCode}`}
            city={place}
            features={features}
            onFeatureChange={onFeatureChange}
          />
        ))}
      </AccordionDetails>
    </Accordion>
  );
};
