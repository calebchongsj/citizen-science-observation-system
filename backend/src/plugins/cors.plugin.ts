import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';

export interface CorsPluginOptions {
  allowedOrigins?: string[];
}

const corsPlugin: FastifyPluginAsync<CorsPluginOptions> = async (fastify, options) => {
  const { allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'] } = options;

  await fastify.register(fastifyCors, {
    origin: process.env.NODE_ENV === 'production' ? false : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
};

export default fp(corsPlugin, {
  name: 'cors-plugin',
});
