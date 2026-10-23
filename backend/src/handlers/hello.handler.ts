import { HelloParamsSchema, HelloResponseSchema } from '../schemas/hello.schema';
import { FastifyRequestTypeBox, FastifyReplyTypeBox } from '../types/fastify';

const HelloSchema = {
  params: HelloParamsSchema,
  response: {
    200: HelloResponseSchema,
  },
};

export async function helloHandler(
  request: FastifyRequestTypeBox<typeof HelloSchema>,
  _reply: FastifyReplyTypeBox<typeof HelloSchema>
) {
  return { message: `Hello, ${request.params.name}!` };
}
