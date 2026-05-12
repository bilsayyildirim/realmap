import { Static, Type } from '@sinclair/typebox';

export const ServerResponseSchema = Type.Object({
  error: Type.Optional(Type.String()),
});

export type ServerResponse = Static<typeof ServerResponseSchema>;
