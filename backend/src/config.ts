import { Type, Static } from '@sinclair/typebox';

export const RoleSchema = Type.Union([
  Type.Literal('user'),
  Type.Literal('admin'),
]);

export type Role = Static<typeof RoleSchema>;

export const config = {
  /**
   * Bootstrap admin emails.
   * 
   * These emails can access the POST /api/users/change-role endpoint
   * even without having the 'admin' role set in Firebase custom claims.
   * 
   * This solves the chicken-and-egg problem: how does the first admin
   * get admin role if only admins can assign roles?
   * 
   * Usage:
   * 1. Add your email to this list
   * 2. Sign in to the app
   * 3. Call POST /api/users/change-role with your own email and role: 'admin'
   * 4. Sign out and back in to get a fresh token with the admin claim
   * 5. Now you have full admin access via the role (not just this list)
   * 
   * Note: Users in this list can ONLY access /api/users/change-role.
   * For other admin endpoints (like GET /api/users), they still need
   * the actual 'admin' role set in their Firebase custom claims.
   */
  // Add your email here to bootstrap the first admin account.
  // See the usage instructions above for the full flow.
  adminEmails: [
    "calebchongsj@gmail.com",
    "adityaghosh2002@gmail.com",
    "basak20021974@gmail.com",
    "joshuaebenezar14@gmail.com"
  ] as string[],
  roles: ['user', 'admin'] as const,
};
