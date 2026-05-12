import {
  CookingMethodsSchema,
  IngredientsSchema,
} from '@realmap/shared/client';
import { FeatureName, FeatureType } from '../types/features';

/**
 * Converts a cooking method key (e.g. 'slow_cooking', 'deep-frying')
 * to a human-friendly label (e.g. 'Slow Cooking', 'Deep Frying').
 */
export function getCookingMethodLabel(key: string): string {
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const FEATURE_TYPES = {
  ingredients: IngredientsSchema.properties,
  cookingMethods: CookingMethodsSchema.properties,
} as const;

export const getFeatureLabel = (
  featureType: FeatureType,
  featureName: FeatureName,
): string => {
  if (featureType === 'cookingMethods') {
    return getCookingMethodLabel(featureName);
  }
  return featureName.split(/(?=[A-Z])/).join(' ');
};
