import {
  ListUsersResponseSchema,
  ListUsersWithStatsResponseSchema,
  ChangeRoleBodySchema,
  ChangeRoleResponseSchema,
  MeResponseSchema,
  SetUserDisabledBodySchema,
  SetUserDisabledResponseSchema,
} from '../schemas/user.schema';
import { FastifyRequestTypeBox, FastifyReplyTypeBox } from '../types/fastify';
import { getContainer } from '../container';
import { config } from '../config';
import { Type } from '@sinclair/typebox';

const MeSchema = {
  response: {
    200: MeResponseSchema,
  },
};

export async function meHandler(
  request: FastifyRequestTypeBox<typeof MeSchema>,
  _reply: FastifyReplyTypeBox<typeof MeSchema>
) {
  if (!request.user) {
    throw new Error('User not found in request');
  }

  const { userService } = getContainer();
  await userService.ensureUserOnboarded(request.user.uid);

  const email = request.user.email?.toLowerCase();
  const isAdminEmail = email && config.adminEmails.map((e) => e.toLowerCase()).includes(email);
  const effectiveRole: 'admin' | 'user' = (request.user.role === 'admin' || isAdminEmail) ? 'admin' : 'user';

  return {
    uid: request.user.uid,
    email: request.user.email,
    role: effectiveRole,
  };
}

const ListUsersSchema = {
  response: {
    200: ListUsersResponseSchema,
  },
};

export async function listUsersHandler(
  _request: FastifyRequestTypeBox<typeof ListUsersSchema>,
  _reply: FastifyReplyTypeBox<typeof ListUsersSchema>
) {
  const { userService } = getContainer();
  const users = await userService.getAllUsers();
  return { users };
}

const ListUsersWithStatsSchema = {
  response: {
    200: ListUsersWithStatsResponseSchema,
  },
};

export async function listUsersWithStatsHandler(
  _request: FastifyRequestTypeBox<typeof ListUsersWithStatsSchema>,
  _reply: FastifyReplyTypeBox<typeof ListUsersWithStatsSchema>,
) {
  const { userService } = getContainer();
  return userService.getUsersWithStats();
}

const ChangeRoleSchema = {
  body: ChangeRoleBodySchema,
  response: {
    200: ChangeRoleResponseSchema,
  },
};

export async function changeRoleHandler(
  request: FastifyRequestTypeBox<typeof ChangeRoleSchema>,
  _reply: FastifyReplyTypeBox<typeof ChangeRoleSchema>
) {
  const { userService } = getContainer();
  const { email, role } = request.body;
  return userService.changeRole(email, role);
}

const SetUserDisabledSchema = {
  params: Type.Object({
    uid: Type.String(),
  }),
  body: SetUserDisabledBodySchema,
  response: {
    200: SetUserDisabledResponseSchema,
  },
};

export async function setUserDisabledHandler(
  request: FastifyRequestTypeBox<typeof SetUserDisabledSchema>,
  _reply: FastifyReplyTypeBox<typeof SetUserDisabledSchema>,
) {
  const { userService } = getContainer();
  if (!request.user) {
    throw new Error('User not found in request');
  }
  return userService.setUserDisabled(
    request.user.uid,
    request.params.uid,
    request.body.disabled,
  );
}
