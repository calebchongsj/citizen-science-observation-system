import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { HealthResponseSchema } from '../schemas/health.schema';
import { healthHandler } from '../handlers/health.handler';

export const healthRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/api/health', {
    schema: {
      operationId: 'checkHealth',
      description: 'Check API health',
      tags: ['RafflesGo'],
      response: {
        200: HealthResponseSchema,
      },
    },
  }, healthHandler);
};
