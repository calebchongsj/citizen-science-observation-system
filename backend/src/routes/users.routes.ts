import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  MeResponseSchema,
  ListUsersResponseSchema,
  ListUsersWithStatsResponseSchema,
  ChangeRoleBodySchema,
  ChangeRoleResponseSchema,
  SetUserDisabledBodySchema,
  SetUserDisabledResponseSchema,
} from '../schemas/user.schema';
import {
  meHandler,
  listUsersHandler,
  listUsersWithStatsHandler,
  changeRoleHandler,
  setUserDisabledHandler,
} from '../handlers/users.handler';
import { verifyToken, requireAdminEmail } from '../middleware/auth.middleware';

export const usersRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // Get current user info
  fastify.get('/api/users/me', {
    preHandler: [verifyToken],
    schema: {
      operationId: 'getCurrentUser',
      description: 'Get current authenticated user info',
      tags: ['RafflesGo'],
      security: [{ bearerAuth: [] }],
      response: {
        200: MeResponseSchema,
      },
    },
  }, meHandler);

  // List all users (admin only)
  fastify.get('/api/users', {
    preHandler: [verifyToken, requireAdminEmail],
    schema: {
      operationId: 'listUsers',
      description: 'List all users (admin only)',
      tags: ['RafflesGo'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ListUsersResponseSchema,
      },
    },
  }, listUsersHandler);

  // List all users with participation/sightings stats (admin only)
  fastify.get('/api/users/stats', {
    preHandler: [verifyToken, requireAdminEmail],
    schema: {
      operationId: 'listUsersWithStats',
      description: 'List all users with stats (admin only)',
      tags: ['RafflesGo'],
      security: [{ bearerAuth: [] }],
      response: {
        200: ListUsersWithStatsResponseSchema,
      },
    },
  }, listUsersWithStatsHandler);

  // Change user role (admin only)
  fastify.post('/api/users/change-role', {
    preHandler: [verifyToken, requireAdminEmail],
    schema: {
      operationId: 'changeUserRole',
      description: 'Change a user role (admin only)',
      tags: ['RafflesGo'],
      security: [{ bearerAuth: [] }],
      body: ChangeRoleBodySchema,
      response: {
        200: ChangeRoleResponseSchema,
      },
    },
  }, changeRoleHandler);

  // Deactivate/reactivate user (admin only)
  fastify.patch('/api/users/:uid/disabled', {
    preHandler: [verifyToken, requireAdminEmail],
    schema: {
      operationId: 'setUserDisabled',
      description: 'Deactivate or reactivate a user (admin only)',
      tags: ['RafflesGo'],
      security: [{ bearerAuth: [] }],
      params: Type.Object({
        uid: Type.String(),
      }),
      body: SetUserDisabledBodySchema,
      response: {
        200: SetUserDisabledResponseSchema,
      },
    },
  }, setUserDisabledHandler);
};
