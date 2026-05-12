import { Static, Type } from '@sinclair/typebox';

export const SearchParamsSchema = Type.Object({
  query: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  offset: Type.Optional(Type.Number()),
  includes: Type.Optional(Type.Array(Type.String())),
  sort: Type.Optional(Type.Array(Type.String())),
});

export type SearchParams = Static<typeof SearchParamsSchema>;
