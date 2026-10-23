import { Type, Static } from '@sinclair/typebox';
import { RoleSchema } from '../config';

export const UserSchema = Type.Object({
  uid: Type.String(),
  email: Type.Optional(Type.String()),
  displayName: Type.Optional(Type.String()),
  photoURL: Type.Optional(Type.String()),
  disabled: Type.Boolean(),
  createdAt: Type.Optional(Type.String()),
  role: RoleSchema,
});

export const ListUsersResponseSchema = Type.Object({
  users: Type.Array(UserSchema),
});

export const UserStatsSchema = Type.Object({
  walks_registered: Type.Number(),
  upcoming_walks: Type.Number(),
  completed_walks: Type.Number(),
  sightings_submitted: Type.Number(),
});

export const UserWithStatsSchema = Type.Composite([UserSchema, UserStatsSchema]);

export const UserStatsSummarySchema = Type.Object({
  total_users: Type.Number(),
  total_volunteers: Type.Number(),
  total_admins: Type.Number(),
  total_disabled: Type.Number(),
  total_existing_walks: Type.Number(),
  total_upcoming_walks: Type.Number(),
  total_completed_walks: Type.Number(),
  total_abandoned_walks: Type.Number(),
});

export const ListUsersWithStatsResponseSchema = Type.Object({
  users: Type.Array(UserWithStatsSchema),
  summary: UserStatsSummarySchema,
});

export const SetUserDisabledBodySchema = Type.Object({
  disabled: Type.Boolean(),
});

export const SetUserDisabledResponseSchema = Type.Object({
  success: Type.Boolean(),
  uid: Type.String(),
  disabled: Type.Boolean(),
});

export const ChangeRoleBodySchema = Type.Object({
  email: Type.String(),
  role: RoleSchema,
});

export const ChangeRoleResponseSchema = Type.Object({
  success: Type.Boolean(),
  email: Type.String(),
  role: RoleSchema,
});

export const MeResponseSchema = Type.Object({
  uid: Type.String(),
  email: Type.Optional(Type.String()),
  role: RoleSchema,
});

export const UserOnboardingRecordSchema = Type.Object({
  uid: Type.String(),
  email: Type.Optional(Type.String()),
  displayName: Type.Optional(Type.String()),
  createdAt: Type.String(),
  welcomeEmailSentAt: Type.Optional(Type.String()),
  adminReviewEmailSentAt: Type.Optional(Type.String()),
});

export type User = Static<typeof UserSchema>;
export type ListUsersResponse = Static<typeof ListUsersResponseSchema>;
export type UserStats = Static<typeof UserStatsSchema>;
export type UserWithStats = Static<typeof UserWithStatsSchema>;
export type UserStatsSummary = Static<typeof UserStatsSummarySchema>;
export type ListUsersWithStatsResponse = Static<typeof ListUsersWithStatsResponseSchema>;
export type ChangeRoleBody = Static<typeof ChangeRoleBodySchema>;
export type ChangeRoleResponse = Static<typeof ChangeRoleResponseSchema>;
export type MeResponse = Static<typeof MeResponseSchema>;
export type SetUserDisabledBody = Static<typeof SetUserDisabledBodySchema>;
export type SetUserDisabledResponse = Static<typeof SetUserDisabledResponseSchema>;
export type UserOnboardingRecord = Static<typeof UserOnboardingRecordSchema>;
