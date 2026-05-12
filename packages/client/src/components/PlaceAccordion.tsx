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
import { FeatureSliders } from './FeatureSliders';

interface PlaceAccordionProps {
  city: ICity;
  features: Record<string, PlaceFeatures>;
  onFeatureChange: (
    placeId: string,
    featureType: FeatureType,
    featureName: FeatureName,
  ) => (event: Event, value: number | number[]) => void;
}

export const PlaceAccordion: React.FC<PlaceAccordionProps> = ({
  city,
  features,
  onFeatureChange,
}: PlaceAccordionProps) => {
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>{city.name}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <FeatureSliders
          city={city}
          features={features}
          onFeatureChange={onFeatureChange}
        />
      </AccordionDetails>
    </Accordion>
  );
};
