/**
 * Generate OpenAPI spec from Fastify routes
 * Run with: npm run generate-spec
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildApp } from './app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSpec() {
  // Build app without static file serving (not needed for spec generation)
  const fastify = await buildApp({ logger: false, serveStatic: false });

  // Wait for Fastify to be ready (registers all routes and plugins)
  await fastify.ready();

  // Get the generated OpenAPI spec
  const spec = fastify.swagger();

  // Ensure output directory exists
  const outputDir = path.join(__dirname, '../../openapi');
  mkdirSync(outputDir, { recursive: true });

  // Write JSON spec
  const jsonPath = path.join(outputDir, 'spec.json');
  writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
  console.log(`Generated OpenAPI spec: ${jsonPath}`);

  // Close Fastify
  await fastify.close();
}

generateSpec().catch((err) => {
  console.error('Failed to generate spec:', err);
  process.exit(1);
});
