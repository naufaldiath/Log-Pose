import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { discoverRepos, resolveRepoId } from '../services/repo.js';
import { listDirectory, readFile, writeFile, deleteFile } from '../services/file.js';
import { searchRepo } from '../services/search.js';
import { getStatus, getDiff, getLog, getBranches, isGitRepository } from '../services/git.js';
import { taskRunner } from '../services/task-runner.js';
import { auditLogger } from '../services/audit-logger.js';
import { PathSecurityError } from '../utils/path-safety.js';
import { sessionManager } from '../services/claude-session.js';

// Request schemas
const repoIdSchema = z.object({
  repoId: z.string().min(1),
});

const treeQuerySchema = z.object({
  repoId: z.string().min(1),
  path: z.string().default(''),
});

const fileQuerySchema = z.object({
  repoId: z.string().min(1),
  path: z.string().min(1),
});

const searchBodySchema = z.object({
  repoId: z.string().min(1),
  query: z.string().min(1).max(200),
  paths: z.array(z.string()).optional(),
});

const gitLogQuerySchema = z.object({
  repoId: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const gitDiffQuerySchema = z.object({
  repoId: z.string().min(1),
  path: z.string().optional(),
});

const taskRunBodySchema = z.object({
  repoId: z.string().min(1),
  taskId: z.string().min(1),
});

const taskStopBodySchema = z.object({
  runId: z.string().min(1),
});

/**
 * API routes plugin
 */
export const apiRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper to resolve repo and validate access
  async function getRepoPath(repoId: string): Promise<string> {
    const repoPath = await resolveRepoId(repoId);
    if (!repoPath) {
      throw fastify.httpErrors.notFound(`Repository not found: ${repoId}`);
    }
    return repoPath;
  }
  
  // Error handler for path security errors
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof PathSecurityError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
      });
    }
    throw error;
  });
  
  // GET /api/me - Get authenticated user info
  fastify.get('/api/me', async (request, reply) => {
    const user = requireAuth(request, reply);
    return {
      email: user.email,
      displayName: user.displayName,
    };
  });
  
  // GET /api/repos - List available repositories
  fastify.get('/api/repos', async (request, reply) => {
    requireAuth(request, reply);
    const repos = await discoverRepos();
    return repos;
  });
  
  // GET /api/tree - Get directory listing
  fastify.get('/api/tree', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = treeQuerySchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    const tree = await listDirectory(repoPath, query.path);
    
    return tree;
  });
  
  // GET /api/file - Read a file
  fastify.get('/api/file', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = fileQuerySchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    const file = await readFile(repoPath, query.path);
    
    auditLogger.logFileRead(user.email, query.repoId, query.path, file.content.length);
    
    return file;
  });
  
  // PUT /api/file - Write a file
  fastify.put('/api/file', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = fileQuerySchema.parse(request.query);
    const body = z.object({ content: z.string() }).parse(request.body);
    
    const repoPath = await getRepoPath(query.repoId);
    const result = await writeFile(repoPath, query.path, body.content);
    
    auditLogger.logFileWrite(user.email, query.repoId, query.path, result.bytesWritten);
    
    return result;
  });
  
  // DELETE /api/file - Delete a file
  fastify.delete('/api/file', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = fileQuerySchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    await deleteFile(repoPath, query.path);
    
    auditLogger.logFileDelete(user.email, query.repoId, query.path);
    
    return { ok: true };
  });
  
  // POST /api/search - Search in repository
  fastify.post('/api/search', async (request, reply) => {
    const user = requireAuth(request, reply);
    const body = searchBodySchema.parse(request.body);
    
    const repoPath = await getRepoPath(body.repoId);
    const results = await searchRepo(repoPath, body.query, body.paths);
    
    auditLogger.logSearch(user.email, body.repoId, body.query, results.matches.length);
    
    return results;
  });
  
  // GET /api/git/status - Get git status
  fastify.get('/api/git/status', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = repoIdSchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    
    if (!(await isGitRepository(repoPath))) {
      return reply.status(400).send({
        error: 'Not a git repository',
      });
    }
    
    const status = await getStatus(repoPath);
    return status;
  });
  
  // GET /api/git/diff - Get git diff
  fastify.get('/api/git/diff', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = gitDiffQuerySchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    
    if (!(await isGitRepository(repoPath))) {
      return reply.status(400).send({
        error: 'Not a git repository',
      });
    }
    
    const diff = await getDiff(repoPath, query.path);
    return { diff };
  });
  
  // GET /api/git/log - Get git log
  fastify.get('/api/git/log', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = gitLogQuerySchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    
    if (!(await isGitRepository(repoPath))) {
      return reply.status(400).send({
        error: 'Not a git repository',
      });
    }
    
    const commits = await getLog(repoPath, query.limit);
    return { commits };
  });
  
  // GET /api/git/branches - Get branches
  fastify.get('/api/git/branches', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = repoIdSchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    
    if (!(await isGitRepository(repoPath))) {
      return reply.status(400).send({
        error: 'Not a git repository',
      });
    }
    
    const branches = await getBranches(repoPath);
    return branches;
  });
  
  // GET /api/tasks - List available tasks
  fastify.get('/api/tasks', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = repoIdSchema.parse(request.query);
    
    const repoPath = await getRepoPath(query.repoId);
    const tasks = await taskRunner.getAvailableTasks(repoPath);
    
    return { tasks };
  });
  
  // POST /api/tasks/run - Run a task
  fastify.post('/api/tasks/run', async (request, reply) => {
    const user = requireAuth(request, reply);
    const body = taskRunBodySchema.parse(request.body);
    
    const repoPath = await getRepoPath(body.repoId);
    const run = await taskRunner.runTask(body.repoId, repoPath, body.taskId, user.email);
    
    auditLogger.logTaskStart(user.email, body.repoId, body.taskId, run.runId);
    
    return run;
  });
  
  // POST /api/tasks/stop - Stop a task
  fastify.post('/api/tasks/stop', async (request, reply) => {
    const user = requireAuth(request, reply);
    const body = taskStopBodySchema.parse(request.body);
    
    const success = taskRunner.stopTask(body.runId);
    
    if (!success) {
      return reply.status(404).send({
        error: 'Task not found or already stopped',
      });
    }
    
    return { ok: true };
  });
  
  // GET /api/tasks/:runId - Get task status
  fastify.get('/api/tasks/:runId', async (request, reply) => {
    const user = requireAuth(request, reply);
    const { runId } = request.params as { runId: string };

    const task = taskRunner.getTask(runId);

    if (!task) {
      return reply.status(404).send({
        error: 'Task not found',
      });
    }

    return task;
  });

  // === Terminal Session (Tabs) API ===

  // GET /api/sessions - List sessions for a repo
  fastify.get('/api/sessions', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = repoIdSchema.parse(request.query);

    const tabs = sessionManager.listSessions(user.email, query.repoId);
    return { tabs };
  });

  // POST /api/sessions - Create new session
  fastify.post('/api/sessions', async (request, reply) => {
    const user = requireAuth(request, reply);
    const body = z.object({
      repoId: z.string().min(1),
      name: z.string().min(1).max(50).optional(),
    }).parse(request.body);

    const repoPath = await getRepoPath(body.repoId);

    try {
      const session = await sessionManager.createSession(
        user.email,
        body.repoId,
        repoPath,
        body.name
      );

      return {
        id: session.id,
        name: session.name,
        state: session.state,
        createdAt: session.createdAt,
      };
    } catch (error: any) {
      // Handle session limit errors with clear status codes
      if (error.message?.includes('Maximum sessions per user reached')) {
        return reply.status(429).send({
          error: 'Session Limit Reached',
          message: error.message,
          code: 'MAX_SESSIONS_PER_USER',
        });
      }
      if (error.message?.includes('Server at maximum capacity')) {
        return reply.status(503).send({
          error: 'Server Busy',
          message: error.message,
          code: 'SERVER_MAX_CAPACITY',
        });
      }
      throw error;
    }
  });

  // DELETE /api/sessions/:sessionId - Delete a session
  fastify.delete('/api/sessions/:sessionId', async (request, reply) => {
    const user = requireAuth(request, reply);
    const { sessionId } = request.params as { sessionId: string };

    // Verify session belongs to user
    const session = sessionManager.getSession(sessionId);
    if (!session || session.userEmail !== user.email) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    sessionManager.terminateSession(sessionId);
    return { ok: true };
  });

  // PATCH /api/sessions/:sessionId - Rename a session
  fastify.patch('/api/sessions/:sessionId', async (request, reply) => {
    const user = requireAuth(request, reply);
    const { sessionId } = request.params as { sessionId: string };
    const body = z.object({
      name: z.string().min(1).max(50),
    }).parse(request.body);

    // Verify session belongs to user
    const session = sessionManager.getSession(sessionId);
    if (!session || session.userEmail !== user.email) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const success = sessionManager.renameSession(sessionId, body.name);
    return { ok: success };
  });

  // GET /api/sessions/all - Get all sessions for current user across all repos
  fastify.get('/api/sessions/all', async (request, reply) => {
    const user = requireAuth(request, reply);

    const sessions = sessionManager.getUserSessions(user.email);

    // Get repo names for each session
    const repos = await discoverRepos();
    const repoMap = new Map(repos.map(r => [r.repoId, r.name]));

    const sessionsWithRepo = sessions.map(session => ({
      id: session.id,
      repoId: session.repoId,
      repoName: repoMap.get(session.repoId) || session.repoId,
      name: session.name,
      state: session.state,
      createdAt: session.createdAt,
    }));

    return { sessions: sessionsWithRepo };
  });
};
