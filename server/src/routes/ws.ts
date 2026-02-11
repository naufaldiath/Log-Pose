import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { z } from 'zod';
import { sessionManager } from '../services/claude-session.js';
import { resolveRepoId } from '../services/repo.js';
import { auditLogger } from '../services/audit-logger.js';
import { analyticsLogger } from '../services/analytics-logger.js';
import { config } from '../utils/config.js';
import type { ClientMessage, ServerMessage, AuthenticatedUser } from '../types/index.js';

// Message schemas with security limits
const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attach'),
    sessionId: z.string().optional(), // Optional: if not provided, creates new session
    cols: z.number().min(1).max(500).optional(),
    rows: z.number().min(1).max(200).optional(),
    branch: z.string().min(1).max(100).optional(), // Optional: git branch for worktree isolation
  }),
  // Limit input data to 64KB per message to prevent DoS
  z.object({ type: z.literal('input'), data: z.string().max(65536) }),
  z.object({ type: z.literal('resize'), cols: z.number().min(1).max(500), rows: z.number().min(1).max(200) }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('restart') }),
]);

/**
 * WebSocket routes for Claude terminal
 */
export const wsRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper to send message to client
  function sendMessage(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  // Claude terminal WebSocket
  fastify.get('/ws/claude', { websocket: true }, async (socket, request) => {
    // Get user from request (auth middleware already ran)
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      sendMessage(socket, { type: 'error', message: 'Unauthorized' });
      socket.close(4001, 'Unauthorized');
      return;
    }

    // Get repoId from query
    const repoId = (request.query as { repoId?: string }).repoId;

    if (!repoId) {
      sendMessage(socket, { type: 'error', message: 'repoId is required' });
      socket.close(4000, 'repoId is required');
      return;
    }

    // Resolve repo path
    const repoPath = await resolveRepoId(repoId);

    if (!repoPath) {
      sendMessage(socket, { type: 'error', message: 'Repository not found' });
      socket.close(4004, 'Repository not found');
      return;
    }

    // Generate client ID
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const wsStartTime = Date.now();

    // Logging
    auditLogger.logWsConnect(user.email, repoId, clientId);

    // Keep-alive
    let isAlive = true;
    const pingInterval = setInterval(() => {
      if (!isAlive) {
        socket.close(4002, 'Ping timeout');
        return;
      }
      isAlive = false;
      sendMessage(socket, { type: 'pong' }); // Server-initiated ping
    }, 30000);

    // Session client interface
    const client = {
      id: clientId,
      send: (message: ServerMessage) => sendMessage(socket, message),
    };

    // Track current session
    let currentSessionId: string | null = null;

    // Handle messages
    socket.on('message', async (data: Buffer | string) => {
      isAlive = true;

      try {
        const text = typeof data === 'string' ? data : data.toString();
        const message = clientMessageSchema.parse(JSON.parse(text));

        switch (message.type) {
          case 'attach': {
            try {
              let session;

              if (message.sessionId) {
                // Attach to existing session
                const existingSession = sessionManager.getSession(message.sessionId);
                if (!existingSession) {
                  sendMessage(socket, { type: 'error', message: 'Session not found' });
                  return;
                }
                if (existingSession.userEmail !== user.email || existingSession.repoId !== repoId) {
                  sendMessage(socket, { type: 'error', message: 'Session access denied' });
                  return;
                }
                session = existingSession;
              } else {
                // Create new session
                session = await sessionManager.createSession(
                  user.email,
                  repoId,
                  repoPath,
                  undefined, // auto-generate name
                  message.cols,
                  message.rows,
                  message.branch // optional branch for worktree isolation
                );
              }

              currentSessionId = session.id;

              // Attach client
              const result = sessionManager.attachClient(session.id, client);

              if (result) {
                // Send session info
                sendMessage(socket, {
                  type: 'status',
                  state: result.session.state,
                  sessionId: result.session.id,
                  sessionName: result.session.name,
                  branch: result.session.branch,
                });

                // Send replay buffer
                if (result.replay) {
                  sendMessage(socket, {
                    type: 'replay',
                    data: result.replay,
                  });
                }

                const connectTimeMs = Date.now() - wsStartTime;
                analyticsLogger.logTerminalConnected(user.email, repoId, connectTimeMs);
                auditLogger.logClaudeSessionStart(user.email, repoId, session.id);
              } else {
                sendMessage(socket, { type: 'error', message: 'Failed to attach to session' });
              }

            } catch (error: any) {
              sendMessage(socket, {
                type: 'error',
                message: error.message || 'Failed to create session',
              });
            }
            break;
          }

          case 'input': {
            if (!currentSessionId) {
              sendMessage(socket, { type: 'error', message: 'Not attached to session' });
              return;
            }

            const success = sessionManager.sendInput(currentSessionId, message.data);

            if (!success) {
              sendMessage(socket, { type: 'error', message: 'Session not running' });
            }
            break;
          }

          case 'resize': {
            if (!currentSessionId) {
              return;
            }

            sessionManager.resize(currentSessionId, message.cols, message.rows);
            break;
          }

          case 'ping': {
            sendMessage(socket, { type: 'pong' });
            break;
          }

          case 'restart': {
            if (!currentSessionId) {
              sendMessage(socket, { type: 'error', message: 'Not attached to session' });
              return;
            }

            try {
              const session = await sessionManager.restartSession(currentSessionId);

              if (session) {
                sendMessage(socket, {
                  type: 'status',
                  state: session.state,
                  message: 'Session restarted',
                });
              } else {
                sendMessage(socket, { type: 'error', message: 'Failed to restart session' });
              }
            } catch (error: any) {
              sendMessage(socket, {
                type: 'error',
                message: error.message || 'Failed to restart session',
              });
            }
            break;
          }
        }

      } catch (error) {
        console.error('Failed to process message:', error);
        sendMessage(socket, { type: 'error', message: 'Invalid message format' });
      }
    });

    // Handle close
    socket.on('close', () => {
      clearInterval(pingInterval);

      const durationMs = Date.now() - wsStartTime;
      analyticsLogger.logTerminalDisconnected(user.email, repoId, durationMs);

      if (currentSessionId) {
        sessionManager.detachClient(currentSessionId, clientId);
      }

      auditLogger.logWsDisconnect(user.email, repoId, clientId);
    });

    // Handle error
    socket.on('error', (error) => {
      console.error(`WebSocket error: ${user.email} -> ${repoId}:`, error);
      analyticsLogger.logWebSocketError(user.email, repoId, error.message || 'unknown');
    });
  });

  // Task output WebSocket
  fastify.get('/ws/tasks', { websocket: true }, async (socket, request) => {
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    const runId = (request.query as { runId?: string }).runId;

    if (!runId) {
      socket.close(4000, 'runId is required');
      return;
    }

    // Import taskRunner
    const { taskRunner } = await import('../services/task-runner.js');

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const client = {
      id: clientId,
      send: (data: { type: string; data?: string; state?: string }) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(data));
        }
      },
    };

    const result = taskRunner.attachClient(runId, client);

    if (!result) {
      socket.close(4004, 'Task not found');
      return;
    }

    // Send current output
    if (result.output) {
      client.send({ type: 'output', data: result.output });
    }

    // Send current state
    client.send({ type: 'status', state: result.run.state });

    socket.on('close', () => {
      taskRunner.detachClient(runId, clientId);
    });
  });
};
