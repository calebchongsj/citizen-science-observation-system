import { HealthResponseSchema } from '../schemas/health.schema';
import { FastifyRequestTypeBox, FastifyReplyTypeBox } from '../types/fastify';

const HealthSchema = {
  response: {
    200: HealthResponseSchema,
  },
};

export async function healthHandler(
  _request: FastifyRequestTypeBox<typeof HealthSchema>,
  _reply: FastifyReplyTypeBox<typeof HealthSchema>
) {
  return { status: 'OK' };
}
