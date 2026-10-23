import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Request/Response logging plugin for API routes.
 * Logs incoming requests and outgoing responses with bodies.
 */
const loggingPlugin: FastifyPluginAsync = async (fastify) => {
  // Log incoming requests with body
  fastify.addHook('preHandler', async (request) => {
    // Only log API routes (skip static files, docs, etc.)
    if (request.url.startsWith('/api')) {
      request.log.info({
        msg: 'request',
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        body: request.body,
        ip: request.ip,
        user: request.user?.email || 'anonymous',
      });
    }
  });

  // Hook to capture response body
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api')) {
      // Store payload for logging in onResponse
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).responsePayload = payload;
    }
    return payload;
  });

  // Log response with status code, duration, and body
  fastify.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/api')) {
      const responseTime = reply.elapsedTime;
      const statusCode = reply.statusCode;
      
      // Parse response body if it's JSON
      let responseBody: unknown;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = (request as any).responsePayload;
        if (typeof payload === 'string') {
          responseBody = JSON.parse(payload);
        } else {
          responseBody = payload;
        }
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseBody = (request as any).responsePayload;
      }
      
      // Use appropriate log level based on status code
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      
      request.log[logLevel]({
        msg: 'response',
        method: request.method,
        url: request.url,
        statusCode,
        responseTime: `${responseTime.toFixed(2)}ms`,
        body: responseBody,
      });
    }
  });
};

export default fp(loggingPlugin, {
  name: 'logging-plugin',
});
