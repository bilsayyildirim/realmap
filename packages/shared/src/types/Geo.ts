import { Static, Type } from '@sinclair/typebox';

export const GeoPointSchema = Type.Object({
  type: Type.Literal('Point'),
  coordinates: Type.Tuple([Type.Number(), Type.Number()]),
});

export type GeoPoint = Static<typeof GeoPointSchema>;
