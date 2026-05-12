import { Static, TSchema, Type } from '@sinclair/typebox';
import { ServerResponseSchema } from './ServerReponse';

// This function returns a TypeBox schema for a paginated search response
export function SearchResponseSchema<T extends TSchema>(itemSchema: T) {
  return Type.Union([
    ServerResponseSchema,
    Type.Object({
      items: Type.Array(itemSchema),
      total: Type.Number(),
      page: Type.Number(),
      totalPages: Type.Number(),
    }),
  ]);
}

export type SearchResponse<T extends TSchema> = Static<
  ReturnType<typeof SearchResponseSchema<T>>
>;
