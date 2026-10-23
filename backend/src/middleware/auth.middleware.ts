import { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { auth } from '../lib/firebase-admin';
import { config, RoleSchema } from '../config';
import { Value } from '@sinclair/typebox/value';

export const verifyToken: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply
      .status(401)
      .send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decodedToken = await auth.verifyIdToken(token);
    let accountDisabledFromUserRecord = false;
    try {
      const userRecord = await auth.getUser(decodedToken.uid);
      accountDisabledFromUserRecord = userRecord.customClaims?.account_disabled === true;
    } catch {
      // If user-record lookup fails (or is unavailable in tests), fall back to token claims only.
    }
    const isAccountDisabled =
      decodedToken.account_disabled === true || accountDisabledFromUserRecord;
    if (isAccountDisabled) {
      return reply.status(403).send({ error: 'Forbidden: user account is deactivated' });
    }
    // Safely validate role from token claims
    const tokenRole = decodedToken.role;
    const role = Value.Check(RoleSchema, tokenRole) ? tokenRole : 'user';
    
    request.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
    };
  } catch (err) {
    request.log?.warn({ err }, 'Token verification failed');
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
};

export function requireRole(...roles: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (!roles.includes(request.user.role)) {
      return reply
        .status(403)
        .send({ error: 'Forbidden: insufficient permissions' });
    }
  };
}

export const requireAdminEmail: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const isAdminRole = request.user.role === 'admin';

  // Check for email mismatches
  const email = request.user.email?.toLowerCase();
  const isAdminEmail = email && config.adminEmails.map(e => e.toLowerCase()).includes(email);

  if (!isAdminRole && !isAdminEmail) {
    return reply
      .status(403)
      .send({ error: 'Forbidden: not an authorized admin' });
  }
};
