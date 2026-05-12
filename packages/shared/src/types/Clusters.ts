import { Static, Type } from '@sinclair/typebox';
import { CookingMethodsSchema } from './CookingMethods';
import { IngredientsSchema } from './Ingredients';

export const ClusterInfoSchema = Type.Object({
  ingredients: Type.String(),
  cookingMethods: Type.String(),
  all: Type.String(),
});

export const ClustersSchema = Type.Object({
  id: Type.String(),
  cookingMethods: CookingMethodsSchema,
  ingredients: IngredientsSchema,
  clusters: Type.Optional(ClusterInfoSchema),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export type Clusters = Static<typeof ClustersSchema>;
