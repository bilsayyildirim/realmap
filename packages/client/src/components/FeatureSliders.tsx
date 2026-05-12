import { Box, Slider, Typography } from '@mui/material';
import { getCityId } from '@realmap/shared';
import { ICity } from 'country-state-city';
import * as React from 'react';
import { FEATURE_TYPES, getFeatureLabel } from '../constants/features';
import {
  CookingMethodName,
  FeatureName,
  FeatureType,
  IngredientName,
  PlaceFeatures,
} from '../types/features';

interface FeatureSlidersProps {
  city: ICity;
  features: Record<string, PlaceFeatures>;
  onFeatureChange: (
    placeId: string,
    featureType: FeatureType,
    featureName: FeatureName,
  ) => (event: Event, value: number | number[]) => void;
}

export const FeatureSliders: React.FC<FeatureSlidersProps> = ({
  city,
  features,
  onFeatureChange,
}: FeatureSlidersProps) => {
  const renderIngredients = () => {
    const featureNames = Object.keys(
      FEATURE_TYPES.ingredients,
    ) as IngredientName[];

    return (
      <Box key="ingredients" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Ingredients
        </Typography>
        {featureNames.map((featureName) => (
          <Box key={featureName} sx={{ mb: 1 }}>
            <Typography variant="body2">
              {getFeatureLabel('ingredients', featureName)}
            </Typography>
            <Slider
              value={features[getCityId(city)]?.ingredients?.[featureName] || 0}
              onChange={onFeatureChange(
                getCityId(city),
                'ingredients',
                featureName,
              )}
              min={0}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
            />
          </Box>
        ))}
      </Box>
    );
  };

  const renderCookingMethods = () => {
    const featureNames = Object.keys(
      FEATURE_TYPES.cookingMethods,
    ) as CookingMethodName[];

    return (
      <Box key="cookingMethods" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Cooking Methods
        </Typography>
        {featureNames.map((featureName) => (
          <Box key={featureName} sx={{ mb: 1 }}>
            <Typography variant="body2">
              {getFeatureLabel('cookingMethods', featureName)}
            </Typography>
            <Slider
              value={
                features[getCityId(city)]?.cookingMethods?.[featureName] || 0
              }
              onChange={onFeatureChange(
                getCityId(city),
                'cookingMethods',
                featureName,
              )}
              min={0}
              max={1}
              step={0.01}
              valueLabelDisplay="auto"
            />
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box>
      {renderIngredients()}
      {renderCookingMethods()}
    </Box>
  );
};
