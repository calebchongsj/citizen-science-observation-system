import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AuthUser } from '../schemas/auth.schema';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('user', null);
};

export default fp(authPlugin, {
  name: 'auth-plugin',
});
