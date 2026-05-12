import { Static, Type } from '@sinclair/typebox';
import { CookingMethodsSchema } from './CookingMethods';

export const PlaceSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  address: Type.Optional(Type.String()),
  city: Type.Optional(Type.String()),
  country: Type.String(),
  continent: Type.String(),
  coordinates: Type.Object({
    lat: Type.Number(),
    lng: Type.Number(),
  }),
  type: Type.String(),
  rating: Type.Optional(Type.Number()),
  priceRange: Type.Optional(Type.String()),
  openingHours: Type.Optional(Type.String()),
  website: Type.Optional(Type.String()),
  phone: Type.Optional(Type.String()),
  email: Type.Optional(Type.String()),
  images: Type.Optional(Type.Array(Type.String())),
  features: Type.Optional(
    Type.Object({
      ingredients: Type.Optional(Type.Array(Type.String())),
      cookingMethods: Type.Optional(CookingMethodsSchema),
    }),
  ),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

export type Place = Static<typeof PlaceSchema>;

export const PlaceTypeSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  icon: Type.Optional(Type.String()),
  color: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

export type PlaceType = Static<typeof PlaceTypeSchema>;

export const LocationSchema = Type.Object({
  lat: Type.Number(),
  lon: Type.Number(),
  coordinates: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
});

export const BoundingBoxSchema = Type.Object({
  minLat: Type.Number(),
  minLon: Type.Number(),
  maxLat: Type.Number(),
  maxLon: Type.Number(),
});

export const SearchParamsSchema = Type.Object({
  query: Type.Optional(Type.String()),
  bbox: Type.Optional(BoundingBoxSchema),
  type: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  offset: Type.Optional(Type.Number()),
});

// Export TypeScript types derived from TypeBox schemas
export type BoundingBox = typeof BoundingBoxSchema.static;
export type SearchParams = typeof SearchParamsSchema.static;
