import { CookingMethods, Ingredients } from '@realmap/shared/client';

export type FeatureType = 'ingredients' | 'cookingMethods';

export type IngredientName = keyof Ingredients & string;
export type CookingMethodName = keyof CookingMethods & string;
export type FeatureName = IngredientName | CookingMethodName;

export interface PlaceFeatures {
  ingredients?: Record<IngredientName, number>;
  cookingMethods?: Record<CookingMethodName, number>;
}

export interface PlaceUpdate {
  id: string;
  features: PlaceFeatures;
}
