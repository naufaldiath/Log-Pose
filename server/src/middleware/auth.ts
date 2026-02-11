import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../utils/config.js';
import type { AuthenticatedUser } from '../types/index.js';
import * as jose from 'jose';
import { settingsManager } from '../services/settings.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// Cloudflare Access header names
const CF_ACCESS_EMAIL_HEADER = 'cf-access-authenticated-user-email';
const CF_ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

// Cache for Cloudflare public keys
let cfPublicKeys: jose.JWTVerifyGetKey | null = null;
let cfKeysLastFetched = 0;
const CF_KEYS_CACHE_TTL = 3600000; // 1 hour

/**
 * Fetches Cloudflare Access public keys for JWT verification
 */
async function getCloudflarePublicKeys(): Promise<jose.JWTVerifyGetKey> {
  if (cfPublicKeys && Date.now() - cfKeysLastFetched < CF_KEYS_CACHE_TTL) {
    return cfPublicKeys;
  }
  
  if (!config.CF_ACCESS_TEAM_DOMAIN) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN not configured');
  }
  
  const jwksUrl = `https://${config.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));
  
  cfPublicKeys = JWKS;
  cfKeysLastFetched = Date.now();
  
  return JWKS;
}

/**
 * Verifies Cloudflare Access JWT and extracts claims
 */
async function verifyCloudflareJWT(token: string): Promise<{ email: string; name?: string }> {
  const publicKeys = await getCloudflarePublicKeys();
  
  const verifyOptions: jose.JWTVerifyOptions = {};
  
  if (config.CF_ACCESS_AUD) {
    verifyOptions.audience = config.CF_ACCESS_AUD;
  }
  
  const { payload } = await jose.jwtVerify(token, publicKeys, verifyOptions);
  
  if (!payload.email || typeof payload.email !== 'string') {
    throw new Error('JWT missing email claim');
  }
  
  return {
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}

/**
 * Checks if an email is in the allowlist
 */
function isEmailAllowed(email: string): boolean {
  return settingsManager.isEmailAllowed(email);
}

/**
 * Checks if an email has admin privileges
 */
export function isAdmin(email: string): boolean {
  return settingsManager.isAdmin(email);
}

/**
 * Authentication middleware plugin implementation
 */
const authMiddlewareImpl: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check
    if (request.url === '/health') {
      return;
    }

    // Skip auth for static files (only require auth for API and WebSocket routes)
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/ws/')) {
      return;
    }

    // In development mode, allow mock authentication
    if (config.NODE_ENV === 'development') {
      // Check X-Dev-Email header (for HTTP requests)
      const devEmail = request.headers['x-dev-email'] as string;
      // Check devEmail query param (for WebSocket connections)
      const devEmailQuery = (request.query as { devEmail?: string })?.devEmail;
      
      const emailToUse = devEmail || devEmailQuery;
      
      if (emailToUse) {
        if (!isEmailAllowed(emailToUse)) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Your email is not in the allowlist',
          });
        }
        request.user = {
          email: emailToUse,
          displayName: 'Dev User',
        };
        return;
      }
    }
    
    // Extract email from Cloudflare Access header
    const cfEmail = request.headers[CF_ACCESS_EMAIL_HEADER] as string | undefined;
    const cfJwt = request.headers[CF_ACCESS_JWT_HEADER] as string | undefined;
    
    // In production, require JWT verification with audience validation
    if (config.NODE_ENV === 'production') {
      if (!config.CF_ACCESS_AUD || !config.CF_ACCESS_TEAM_DOMAIN) {
        console.error('CRITICAL: CF_ACCESS_AUD and CF_ACCESS_TEAM_DOMAIN must be set in production');
        return reply.status(500).send({
          error: 'Configuration Error',
          message: 'Server authentication not configured',
        });
      }

      if (!cfJwt) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }

      try {
        const claims = await verifyCloudflareJWT(cfJwt);

        if (!isEmailAllowed(claims.email)) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Your email is not in the allowlist',
          });
        }

        request.user = {
          email: claims.email,
          displayName: claims.name,
        };
        return;
      } catch (error) {
        console.error('JWT verification failed:', error);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid authentication token',
        });
      }
    }

    // In development, allow weaker authentication for testing
    // Option B: Verify JWT if configured
    if (cfJwt && config.CF_ACCESS_TEAM_DOMAIN) {
      try {
        const claims = await verifyCloudflareJWT(cfJwt);

        if (!isEmailAllowed(claims.email)) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Your email is not in the allowlist',
          });
        }

        request.user = {
          email: claims.email,
          displayName: claims.name,
        };
        return;
      } catch (error) {
        console.error('JWT verification failed:', error);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid authentication token',
        });
      }
    }

    // Option A (development fallback): Trust Cloudflare header but still check allowlist
    if (cfEmail) {
      if (!isEmailAllowed(cfEmail)) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Your email is not in the allowlist',
        });
      }

      request.user = {
        email: cfEmail,
      };
      return;
    }
    
    // No authentication found
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  });
};

// Wrap with fastify-plugin to break encapsulation so hooks apply globally
export const authMiddleware = fp(authMiddlewareImpl, {
  name: 'auth-middleware',
  fastify: '4.x',
});

/**
 * Helper to require authentication in routes
 */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthenticatedUser {
  if (!request.user) {
    reply.status(401).send({ error: 'Unauthorized' });
    throw new Error('User not authenticated');
  }
  return request.user;
}
