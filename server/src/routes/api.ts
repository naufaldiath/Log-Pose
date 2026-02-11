import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { discoverRepos, resolveRepoId } from '../services/repo.js';
import { listDirectory, readFile, writeFile, deleteFile } from '../services/file.js';
import { searchRepo } from '../services/search.js';
import { getStatus, getDiff, getLog, getBranches, isGitRepository, branchExists } from '../services/git.js';
import { createWorktree, createWorktreeFromBranch, createWorktreeWithNewBranch, getWorktreePath, worktreeExists } from '../services/worktree.js';
import { taskRunner } from '../services/task-runner.js';
import { auditLogger } from '../services/audit-logger.js';
import { analyticsLogger } from '../services/analytics-logger.js';
import { PathSecurityError } from '../utils/path-safety.js';
import { sessionManager } from '../services/claude-session.js';
import { settingsManager } from '../services/settings.js';
import { isAdmin } from '../middleware/auth.js';

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

const gitCheckoutBodySchema = z.object({
  repoId: z.string().min(1),
  branch: z.string().min(1).max(100),
  create: z.boolean().optional(), // Create new branch if doesn't exist
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
      // Log security violation
      if (request.user) {
        analyticsLogger.logPathSecurityViolation(
          request.user.email,
          error.message,
          request.method + ' ' + request.url
        );
      }
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
      });
    }
    throw error;
  });

  // Hook to track API request timing
  fastify.addHook('onRequest', async (request, reply) => {
    (request as any).analyticsStartTime = Date.now();
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.user && (request as any).analyticsStartTime) {
      const durationMs = Date.now() - (request as any).analyticsStartTime;
      const statusCode = reply.statusCode;

      // Don't track analytics endpoints themselves
      if (!request.url.startsWith('/api/analytics')) {
        if (statusCode >= 400) {
          analyticsLogger.logApiError(
            request.user.email,
            request.url,
            statusCode,
            `HTTP_${statusCode}`
          );
        } else {
          analyticsLogger.logApiRequest(
            request.user.email,
            request.url,
            request.method,
            durationMs,
            statusCode
          );
        }
      }
    }
  });
  
  // GET /api/me - Get authenticated user info
  fastify.get('/api/me', async (request, reply) => {
    const user = requireAuth(request, reply);
    return {
      email: user.email,
      displayName: user.displayName,
      isAdmin: isAdmin(user.email),
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

    const startTime = Date.now();
    const repoPath = await getRepoPath(query.repoId);
    const tree = await listDirectory(repoPath, query.path);
    const durationMs = Date.now() - startTime;

    analyticsLogger.logFileTreeLoaded(user.email, query.repoId, tree.entries.length, durationMs);

    return tree;
  });
  
  // GET /api/file - Read a file
  fastify.get('/api/file', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = fileQuerySchema.parse(request.query);

    const startTime = Date.now();
    const repoPath = await getRepoPath(query.repoId);
    const file = await readFile(repoPath, query.path);
    const loadTimeMs = Date.now() - startTime;

    auditLogger.logFileRead(user.email, query.repoId, query.path, file.content.length);
    analyticsLogger.logFileOpened(user.email, query.repoId, query.path, file.content.length, loadTimeMs);

    return file;
  });
  
  // PUT /api/file - Write a file
  fastify.put('/api/file', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = fileQuerySchema.parse(request.query);
    const body = z.object({ content: z.string() }).parse(request.body);

    const startTime = Date.now();
    const repoPath = await getRepoPath(query.repoId);
    const result = await writeFile(repoPath, query.path, body.content);
    const durationMs = Date.now() - startTime;

    auditLogger.logFileWrite(user.email, query.repoId, query.path, result.bytesWritten);
    analyticsLogger.logFileSaved(user.email, query.repoId, query.path, result.bytesWritten, durationMs);

    return result;
  });
  
  // DELETE /api/file - Delete a file
  fastify.delete('/api/file', async (request, reply) => {
    const user = requireAuth(request, reply);
    const query = fileQuerySchema.parse(request.query);

    const repoPath = await getRepoPath(query.repoId);
    await deleteFile(repoPath, query.path);

    auditLogger.logFileDelete(user.email, query.repoId, query.path);
    analyticsLogger.logFileDeleted(user.email, query.repoId, query.path, false);

    return { ok: true };
  });
  
  // POST /api/search - Search in repository
  fastify.post('/api/search', async (request, reply) => {
    const user = requireAuth(request, reply);
    const body = searchBodySchema.parse(request.body);

    const startTime = Date.now();
    const repoPath = await getRepoPath(body.repoId);
    const results = await searchRepo(repoPath, body.query, body.paths);
    const durationMs = Date.now() - startTime;

    auditLogger.logSearch(user.email, body.repoId, body.query, results.matches.length);
    analyticsLogger.logSearchPerformed(
      user.email,
      body.repoId,
      results.matches.length,
      durationMs,
      body.query.includes('regex:') || body.query.includes('.*'),
      !!body.paths && body.paths.length > 0
    );

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
    analyticsLogger.logGitStatusViewed(user.email, query.repoId);
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
    const fileCount = diff ? diff.split('diff --git').length - 1 : 0;
    analyticsLogger.logGitDiffViewed(user.email, query.repoId, fileCount);
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
    analyticsLogger.logGitLogViewed(user.email, query.repoId);
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

  // POST /api/git/checkout - Checkout/create a branch with worktree isolation
  fastify.post('/api/git/checkout', async (request, reply) => {
    const user = requireAuth(request, reply);
    const body = gitCheckoutBodySchema.parse(request.body);

    const repoPath = await getRepoPath(body.repoId);

    if (!(await isGitRepository(repoPath))) {
      return reply.status(400).send({
        error: 'Not a git repository',
      });
    }

    try {
      let worktreePath: string;

      if (body.create) {
        // Create new branch and worktree
        worktreePath = await createWorktreeWithNewBranch(repoPath, user.email, body.branch);
      } else {
        // Use existing branch
        const exists = await branchExists(repoPath, body.branch);
        if (!exists) {
          return reply.status(404).send({
            error: 'Branch not found',
            message: `Branch '${body.branch}' does not exist. Use create: true to create a new branch.`,
          });
        }
        worktreePath = await createWorktreeFromBranch(repoPath, user.email, body.branch);
      }

      analyticsLogger.log('git_checkout', user.email, {
        repoId: body.repoId,
        branch: body.branch,
        create: body.create || false,
      });

      return {
        success: true,
        branch: body.branch,
        worktreePath,
        message: `Checked out ${body.branch} in isolated worktree`,
      };
    } catch (error: any) {
      console.error('[API] Checkout error:', error);
      return reply.status(400).send({
        error: 'Checkout failed',
        message: error.message,
      });
    }
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
    analyticsLogger.logTaskStarted(user.email, body.repoId, body.taskId, run.runId);

    // Track task completion
    const taskStartTime = Date.now();
    const checkTaskCompletion = () => {
      const task = taskRunner.getTask(run.runId);
      if (task && (task.state === 'completed' || task.state === 'failed' || task.state === 'stopped')) {
        const durationMs = Date.now() - taskStartTime;
        analyticsLogger.logTaskCompleted(
          user.email,
          body.repoId,
          body.taskId,
          run.runId,
          durationMs,
          task.exitCode
        );
      } else if (task) {
        // Task still running, check again in 1 second
        setTimeout(checkTaskCompletion, 1000);
      }
    };

    // Start checking for completion
    setTimeout(checkTaskCompletion, 1000);

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
      branch: z.string().min(1).max(100).optional(),
    }).parse(request.body);

    const repoPath = await getRepoPath(body.repoId);

    try {
      const session = await sessionManager.createSession(
        user.email,
        body.repoId,
        repoPath,
        body.name,
        undefined,
        undefined,
        body.branch
      );

      const existingSessions = sessionManager.listSessions(user.email, body.repoId);
      analyticsLogger.logTerminalTabCreated(
        user.email,
        body.repoId,
        session.id,
        existingSessions.length <= 1
      );

      return {
        id: session.id,
        name: session.name,
        state: session.state,
        createdAt: session.createdAt,
        branch: session.branch,
      };
    } catch (error: any) {
      // Handle session limit errors with clear status codes
      if (error.message?.includes('Maximum sessions per user reached')) {
        const userSessions = sessionManager.getUserSessions(user.email);
        analyticsLogger.logTerminalMaxSessions(user.email, body.repoId, userSessions.length);
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

    const sessionAgeMs = Date.now() - session.createdAt.getTime();
    analyticsLogger.logSessionDeleted(user.email, session.repoId, sessionAgeMs);

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
    if (success) {
      analyticsLogger.log('terminal_tab_renamed', user.email, {
        repoId: session.repoId,
        sessionId,
      });
    }
    return { ok: success };
  });

  // GET /api/sessions/all - Get all sessions for current user across all repos
  fastify.get('/api/sessions/all', async (request, reply) => {
    const user = requireAuth(request, reply);

    const sessions = sessionManager.getUserSessions(user.email);

    // Get repo names for each session
    const repos = await discoverRepos();
    const repoMap = new Map(repos.map(r => [r.repoId, r.name]));

    analyticsLogger.logSessionManagerOpened(user.email, repos.length, sessions.length);

    const sessionsWithRepo = sessions.map(session => ({
      id: session.id,
      repoId: session.repoId,
      repoName: repoMap.get(session.repoId) || session.repoId,
      name: session.name,
      state: session.state,
      createdAt: session.createdAt,
      branch: session.branch,
    }));

    return { sessions: sessionsWithRepo };
  });

  // Admin Settings Routes

  // GET /api/admin/settings - Get current settings (admin only)
  fastify.get('/api/admin/settings', async (request, reply) => {
    const user = requireAuth(request, reply);

    if (!isAdmin(user.email)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    const settings = settingsManager.getSettings();
    return {
      allowlistEmails: settings.allowlistEmails,
      adminEmails: settings.adminEmails,
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
    };
  });

  // PUT /api/admin/settings/allowlist - Update allowlist (admin only)
  fastify.put('/api/admin/settings/allowlist', async (request, reply) => {
    const user = requireAuth(request, reply);

    if (!isAdmin(user.email)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    const bodySchema = z.object({
      emails: z.array(z.string().email()),
    });

    const body = bodySchema.parse(request.body);

    try {
      settingsManager.updateAllowlistEmails(body.emails, user.email);
      auditLogger.log('settings_updated', user.email, {
        type: 'allowlist',
        emailCount: body.emails.length,
      });
      return {
        success: true,
        emails: settingsManager.getAllowlistEmails(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update allowlist';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });

  // PUT /api/admin/settings/admin-emails - Update admin emails (admin only)
  fastify.put('/api/admin/settings/admin-emails', async (request, reply) => {
    const user = requireAuth(request, reply);

    if (!isAdmin(user.email)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    const bodySchema = z.object({
      emails: z.array(z.string().email()),
    });

    const body = bodySchema.parse(request.body);

    try {
      settingsManager.updateAdminEmails(body.emails, user.email);
      auditLogger.log('settings_updated', user.email, {
        type: 'admin_emails',
        emailCount: body.emails.length,
      });
      return {
        success: true,
        emails: settingsManager.getAdminEmails(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update admin emails';
      return reply.status(400).send({
        error: 'Bad Request',
        message,
      });
    }
  });
};
