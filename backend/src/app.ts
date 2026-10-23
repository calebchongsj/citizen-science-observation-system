import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import corsPlugin from './plugins/cors.plugin';
import authPlugin from './plugins/auth.plugin';
import loggingPlugin from './plugins/logging.plugin';

import { healthRoutes } from './routes/health.routes';
import { helloRoutes } from './routes/hello.routes';
import { usersRoutes } from './routes/users.routes';
import { imageUploadRoutes } from "./routes/imageUploadRoutes";
import { walkRoutes } from "./modules/walks/walk.routes";
import { participationRoutes } from "./modules/participation/participation.routes";
import { sightingRoutes } from "./modules/sightings/sighting.routes";
import { exportRoutes } from "./modules/export/export.routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// Build App
// ============================================
export interface BuildAppOptions {
  logger?: boolean;
  serveStatic?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const { logger = true, serveStatic = true } = options;

  const fastify = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();

  // ============================================
  // Plugins
  // ============================================
  await fastify.register(corsPlugin);
  await fastify.register(authPlugin);
  await fastify.register(loggingPlugin);

  // Swagger/OpenAPI Configuration
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'RafflesGo API',
        description: 'RafflesGo backend API',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3000' }, 
      ],
      tags: [
        { name: 'RafflesGo', description: 'RafflesGo API endpoints' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Static Files (Frontend)
  if (serveStatic) {
    const publicPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'public')
      : path.join(__dirname, '../public');

    fastify.register(fastifyStatic, {
      root: publicPath,
      prefix: '/',
      wildcard: false,
    });
  }

  // ============================================
  // API Routes
  // ============================================
  await fastify.register(healthRoutes);
  await fastify.register(helloRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(imageUploadRoutes);
  await fastify.register(walkRoutes);
  await fastify.register(participationRoutes);
  await fastify.register(sightingRoutes);
  await fastify.register(exportRoutes);

  // SPA Fallback
  fastify.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api')) {
      reply.status(404).send({ error: 'API route not found' });
    } else if (serveStatic) {
      reply.sendFile('index.html');
    } else {
      reply.status(404).send({ error: 'Not found' });
    }
  });

  return fastify;
}
