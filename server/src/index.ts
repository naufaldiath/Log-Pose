import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifySensible from '@fastify/sensible';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, logConfig } from './utils/config.js';
import { authMiddleware } from './middleware/auth.js';
import { apiRoutes } from './routes/api.js';
import { wsRoutes } from './routes/ws.js';
import { auditLogger } from './services/audit-logger.js';
import { analyticsLogger } from './services/analytics-logger.js';
import { analyticsRoutes } from './routes/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Log configuration
  logConfig();

  // Production environment validation
  if (config.NODE_ENV === 'production') {
    const errors: string[] = [];

    // Check critical Cloudflare Access configuration
    if (!config.CF_ACCESS_AUD) {
      errors.push('CF_ACCESS_AUD must be set in production');
    }
    if (!config.CF_ACCESS_TEAM_DOMAIN) {
      errors.push('CF_ACCESS_TEAM_DOMAIN must be set in production');
    }

    // Check that we're not accidentally in development mode
    if (process.env.X_DEV_EMAIL || process.env.VITE_DEV_EMAIL) {
      errors.push('Development email variables detected in production environment');
    }

    // Warn if Claude path looks like development
    if (config.CLAUDE_PATH && config.CLAUDE_PATH.includes('/opt/homebrew')) {
      console.warn('WARNING: Claude path appears to be macOS Homebrew path. Verify this is correct for production.');
    }

    if (errors.length > 0) {
      console.error('\n❌ PRODUCTION CONFIGURATION ERRORS:');
      errors.forEach(err => console.error(`  - ${err}`));
      console.error('\nFix these issues before deploying to production.\n');
      process.exit(1);
    }

    console.log('✅ Production configuration validated');
  }

  // Cleanup old analytics logs on startup
  analyticsLogger.cleanupOldLogs();

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
  });

  // Register sensible plugin for httpErrors
  await fastify.register(fastifySensible as any);

  // Register CORS (only needed for development when frontend runs on different port)
  await fastify.register(fastifyCors, {
    // In development: allow localhost origins only (Vite dev server)
    // In production: disable CORS (frontend served from same origin)
    origin: config.NODE_ENV === 'development'
      ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173']
      : false,
    credentials: true,
  });

  // Register WebSocket support
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB
    },
  });

  // Health check (no auth required)
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register auth middleware (uses fastify-plugin so hooks apply to all routes)
  await fastify.register(authMiddleware);

  // Register API routes
  await fastify.register(apiRoutes);

  // Register WebSocket routes
  await fastify.register(wsRoutes);

  // Register analytics routes
  await fastify.register(analyticsRoutes);

  // Serve static files (in both development and production for testing)
  // Note: In development, the client usually runs separately on Vite dev server
  // But we enable this for local testing of the production build
  const staticPath = path.join(__dirname, '../../client/dist');

  await fastify.register(fastifyStatic, {
    root: staticPath,
    prefix: '/',
  });

  // SPA fallback
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    return reply.sendFile('index.html');
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    // Don't expose internal errors in production
    const message = config.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : error.message;

    reply.status(error.statusCode || 500).send({
      error: error.name || 'Error',
      message,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);

    auditLogger.close();
    analyticsLogger.close();

    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start server
  try {
    await fastify.listen({
      port: config.PORT,
      host: config.HOST,
    });

    console.log(`\n🚀 Server running at http://${config.HOST}:${config.PORT}`);
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`   Repositories: ${config.REPO_ROOTS.join(', ')}`);
    console.log(`   Allowlisted users: ${config.ALLOWLIST_EMAILS.length}`);

  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

main();
