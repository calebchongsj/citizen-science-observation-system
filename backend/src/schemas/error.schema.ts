import { Type, Static } from '@sinclair/typebox';

export const ErrorSchema = Type.Object({
  error: Type.String(),
});

export type ErrorResponse = Static<typeof ErrorSchema>;
