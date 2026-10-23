import { Type, Static } from '@sinclair/typebox';

export const AuthUserSchema = Type.Object({
  uid: Type.String(),
  email: Type.Optional(Type.String()),
  role: Type.String(),
});

export type AuthUser = Static<typeof AuthUserSchema>;
