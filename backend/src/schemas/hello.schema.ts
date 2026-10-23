import { Type, Static } from '@sinclair/typebox';

export const HelloParamsSchema = Type.Object({
  name: Type.String(),
});

export const HelloResponseSchema = Type.Object({
  message: Type.String(),
});

export type HelloParams = Static<typeof HelloParamsSchema>;
export type HelloResponse = Static<typeof HelloResponseSchema>;
