import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, isAdmin } from '../middleware/auth.js';
import { analyticsLogger } from '../services/analytics-logger.js';
import type { AnalyticsEventType, UserActivitySummary, UserDetail } from '../types/analytics.js';

/**
 * Analytics API routes
 * Admin-only endpoints for retrieving analytics data
 */

// Query schemas
const summaryQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
});

const timeSeriesQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  eventTypes: z.string().optional(), // Comma-separated list
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
  eventType: z.string().optional(),
  days: z.coerce.number().min(1).max(90).default(7),
});

/**
 * Require admin access helper
 */
function requireAdmin(request: any, reply: any) {
  const user = requireAuth(request, reply);

  if (!isAdmin(user.email)) {
    console.warn(`Non-admin user attempted to access analytics: ${user.email}`);
    throw reply.status(403).send({
      error: 'Forbidden',
      message: 'Analytics access requires admin privileges',
    });
  }

  return user;
}

/**
 * Analytics routes plugin
 */
export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/analytics/me - Check if current user is admin
  fastify.get('/api/analytics/me', async (request, reply) => {
    const user = requireAuth(request, reply);

    return {
      isAdmin: isAdmin(user.email),
      email: user.email,
    };
  });

  // GET /api/analytics/summary - Get summary statistics
  fastify.get('/api/analytics/summary', async (request, reply) => {
    requireAdmin(request, reply);

    const query = summaryQuerySchema.parse(request.query);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);

    const summary = await analyticsLogger.getSummary(startDate, endDate);

    return {
      period: {
        days: query.days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary,
    };
  });

  // GET /api/analytics/timeseries - Get time series data
  fastify.get('/api/analytics/timeseries', async (request, reply) => {
    requireAdmin(request, reply);

    const query = timeSeriesQuerySchema.parse(request.query);

    // Parse event types from comma-separated string
    const eventTypes: AnalyticsEventType[] = query.eventTypes
      ? (query.eventTypes.split(',') as AnalyticsEventType[])
      : ['api_request', 'file_opened', 'terminal_connected', 'search_performed'];

    const data = await analyticsLogger.getTimeSeries(eventTypes, query.days);

    return {
      period: {
        days: query.days,
      },
      eventTypes,
      data,
    };
  });

  // GET /api/analytics/feature-adoption - Get feature adoption metrics
  fastify.get('/api/analytics/feature-adoption', async (request, reply) => {
    requireAdmin(request, reply);

    const query = summaryQuerySchema.parse(request.query);

    const metrics = await analyticsLogger.getFeatureAdoption(query.days);

    return {
      period: {
        days: query.days,
      },
      metrics,
    };
  });

  // GET /api/analytics/performance - Get performance metrics
  fastify.get('/api/analytics/performance', async (request, reply) => {
    requireAdmin(request, reply);

    const query = summaryQuerySchema.parse(request.query);

    const metrics = await analyticsLogger.getPerformanceMetrics(query.days);

    return {
      period: {
        days: query.days,
      },
      metrics,
    };
  });

  // GET /api/analytics/events - Get recent events
  fastify.get('/api/analytics/events', async (request, reply) => {
    requireAdmin(request, reply);

    const query = eventsQuerySchema.parse(request.query);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);

    const eventTypes: AnalyticsEventType[] | undefined = query.eventType
      ? [query.eventType as AnalyticsEventType]
      : undefined;

    const events = await analyticsLogger.queryEvents({
      startDate,
      endDate,
      eventTypes,
      limit: query.limit,
    });

    return {
      period: {
        days: query.days,
      },
      filters: {
        eventType: query.eventType,
      },
      count: events.length,
      events,
    };
  });

  // GET /api/analytics/top-repos - Get most active repositories
  fastify.get('/api/analytics/top-repos', async (request, reply) => {
    requireAdmin(request, reply);

    const query = summaryQuerySchema.parse(request.query);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);

    const events = await analyticsLogger.queryEvents({
      startDate,
      endDate,
      limit: 10000,
    });

    // Aggregate by repo
    const repoStats: Record<
      string,
      {
        eventCount: number;
        uniqueUsers: Set<string>;
        fileOpens: number;
        searches: number;
        terminalSessions: number;
      }
    > = {};

    for (const event of events) {
      const repoId = event.properties.repoId as string;
      if (!repoId) continue;

      if (!repoStats[repoId]) {
        repoStats[repoId] = {
          eventCount: 0,
          uniqueUsers: new Set(),
          fileOpens: 0,
          searches: 0,
          terminalSessions: 0,
        };
      }

      repoStats[repoId].eventCount++;
      repoStats[repoId].uniqueUsers.add(event.userId);

      if (event.event === 'file_opened') {
        repoStats[repoId].fileOpens++;
      } else if (event.event === 'search_performed') {
        repoStats[repoId].searches++;
      } else if (event.event === 'terminal_connected') {
        repoStats[repoId].terminalSessions++;
      }
    }

    // Convert to array and sort by event count
    const topRepos = Object.entries(repoStats)
      .map(([repoId, stats]) => ({
        repoId,
        eventCount: stats.eventCount,
        uniqueUsers: stats.uniqueUsers.size,
        fileOpens: stats.fileOpens,
        searches: stats.searches,
        terminalSessions: stats.terminalSessions,
      }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 20);

    return {
      period: {
        days: query.days,
      },
      repos: topRepos,
    };
  });

  // GET /api/analytics/errors - Get error summary
  fastify.get('/api/analytics/errors', async (request, reply) => {
    requireAdmin(request, reply);

    const query = summaryQuerySchema.parse(request.query);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);

    const events = await analyticsLogger.queryEvents({
      startDate,
      endDate,
      eventTypes: ['api_error', 'websocket_error', 'file_operation_error', 'path_security_violation'],
    });

    // Aggregate by error type
    const errorStats: Record<string, { count: number; endpoints: Record<string, number> }> = {};

    for (const event of events) {
      const errorType = event.properties.errorType as string;
      const endpoint = event.properties.endpoint as string;

      if (!errorStats[event.event]) {
        errorStats[event.event] = { count: 0, endpoints: {} };
      }

      errorStats[event.event].count++;

      if (endpoint) {
        errorStats[event.event].endpoints[endpoint] =
          (errorStats[event.event].endpoints[endpoint] || 0) + 1;
      }
    }

    return {
      period: {
        days: query.days,
      },
      totalErrors: events.length,
      errorsByType: errorStats,
    };
  });

  // GET /api/analytics/users - Get user activity summary
  fastify.get('/api/analytics/users', async (request, reply) => {
    requireAdmin(request, reply);

    const query = summaryQuerySchema.parse(request.query);
    const users = await analyticsLogger.getUserActivitySummary(query.days);

    return {
      period: {
        days: query.days,
      },
      count: users.length,
      users,
    };
  });

  // GET /api/analytics/users/:userEmail - Get detailed activity for a specific user
  fastify.get('/api/analytics/users/:userEmail', async (request, reply) => {
    requireAdmin(request, reply);

    const { userEmail } = request.params as { userEmail: string };
    const query = summaryQuerySchema.parse(request.query);

    const userDetail = await analyticsLogger.getUserDetail(decodeURIComponent(userEmail), query.days);

    if (!userDetail) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'User not found or no activity recorded',
      });
    }

    return userDetail;
  });
};
