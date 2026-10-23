import 'dotenv/config';
import { buildApp } from './app';
import { startReminderWorker } from './services/email.service';

// Validate Firebase config at startup
import './lib/firebase-admin';

const start = async () => {
  const fastify = await buildApp({ logger: true, serveStatic: true });

  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    startReminderWorker();
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`API docs available at http://localhost:${port}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
