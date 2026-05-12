import { Static, Type } from '@sinclair/typebox';
import { CookingMethodsSchema } from './CookingMethods';
import { IngredientsSchema } from './Ingredients';

export const PlaceSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  type: Type.Optional(Type.String()),
  countryCode: Type.Optional(Type.String()),
  region: Type.Optional(Type.String()),
  latitude: Type.Optional(Type.Number()),
  longitude: Type.Optional(Type.Number()),
  population: Type.Optional(Type.Number()),
  timeZone: Type.Optional(Type.String()),
  continent: Type.Optional(Type.String()),
  ingredients: Type.Optional(IngredientsSchema),
  cookingMethods: Type.Optional(CookingMethodsSchema),
  clusters: Type.Optional(
    Type.Object({
      all: Type.Number(),
      ingredients: Type.Number(),
      cookingMethods: Type.Number(),
      allValue: Type.Optional(Type.Number()),
      color: Type.Optional(Type.String()),
    }),
  ),
  clusterId: Type.Optional(Type.Number()),
  color: Type.Optional(Type.String()),
  embedding: Type.Optional(Type.Array(Type.Number())),
  hueAngle: Type.Optional(Type.Number()), // pre-computed hue [0, 2π] from 1D manifold rank
  famousDishes: Type.Optional(Type.Array(Type.String())), // Top 1-5 famous dishes per city
  extendedAt: Type.Optional(Type.String()), // ISO timestamp when extended via AI
  // Allow additional properties for flexibility
  // (e.g. description, address, etc.)
});

export type Place = Static<typeof PlaceSchema>;
