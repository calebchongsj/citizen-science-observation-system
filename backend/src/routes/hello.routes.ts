import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { HelloParamsSchema, HelloResponseSchema } from '../schemas/hello.schema';
import { helloHandler } from '../handlers/hello.handler';
import { verifyToken } from '../middleware/auth.middleware';

export const helloRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/api/hello/:name', {
    preHandler: [verifyToken],
    schema: {
      operationId: 'sayHello',
      description: 'Say hello to a user',
      tags: ['RafflesGo'],
      security: [{ bearerAuth: [] }],
      params: HelloParamsSchema,
      response: {
        200: HelloResponseSchema,
      },
    },
  }, helloHandler);
};
