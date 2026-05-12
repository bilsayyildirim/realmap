import { Static, Type } from '@sinclair/typebox';

export const BoundarySchema = Type.Object({
  geometry: Type.Union([
    Type.Object({
      type: Type.Literal('Polygon'),
      coordinates: Type.Array(Type.Array(Type.Array(Type.Number()))),
    }),
    Type.Object({
      type: Type.Literal('MultiPolygon'),
      coordinates: Type.Array(
        Type.Array(Type.Array(Type.Array(Type.Number()))),
      ),
    }),
  ]),
  adminCode: Type.Optional(Type.String()),
  center: Type.Object({
    type: Type.Literal('Point'),
    coordinates: Type.Tuple([Type.Number(), Type.Number()]),
  }),
});

export type Boundary = Static<typeof BoundarySchema>;
