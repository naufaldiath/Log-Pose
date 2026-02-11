import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { config } from '../utils/config.js';
import type { TaskConfig, TaskRun } from '../types/index.js';

/**
 * Task Runner Service
 * Runs whitelisted tasks from .remote-tools.json
 */

const TASK_CONFIG_FILE = '.remote-tools.json';
const DEFAULT_TIMEOUT = 300000; // 5 minutes
const MAX_CONCURRENT_TASKS = 5;

interface TaskEntry {
  run: TaskRun;
  process: ChildProcess | null;
  output: string;
  clients: Set<TaskClient>;
}

interface TaskClient {
  id: string;
  send: (data: { type: string; data?: string; state?: string }) => void;
}

class TaskRunner extends EventEmitter {
  private tasks = new Map<string, TaskEntry>();
  private runningCount = 0;

  /**
   * Loads task configuration from a repo
   */
  async loadTaskConfig(repoPath: string): Promise<TaskConfig | null> {
    if (!config.TASKS_ENABLED) {
      return null;
    }

    try {
      const configPath = path.join(repoPath, TASK_CONFIG_FILE);
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate structure
      if (!parsed.tasks || typeof parsed.tasks !== 'object') {
        console.warn(`Invalid ${TASK_CONFIG_FILE}: missing tasks object`);
        return null;
      }

      // Validate each task is a string array
      for (const [taskId, command] of Object.entries(parsed.tasks)) {
        if (!Array.isArray(command) || !command.every(c => typeof c === 'string')) {
          console.warn(`Invalid task ${taskId}: command must be a string array`);
          delete parsed.tasks[taskId];
        }
      }

      return parsed as TaskConfig;

    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to load ${TASK_CONFIG_FILE}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Gets available tasks for a repo
   */
  async getAvailableTasks(repoPath: string): Promise<string[]> {
    const taskConfig = await this.loadTaskConfig(repoPath);
    if (!taskConfig) {
      return [];
    }
    return Object.keys(taskConfig.tasks);
  }

  /**
   * Runs a task
   */
  async runTask(
    repoId: string,
    repoPath: string,
    taskId: string,
    userEmail: string
  ): Promise<TaskRun> {
    if (!config.TASKS_ENABLED) {
      throw new Error('Task runner is disabled');
    }

    if (this.runningCount >= MAX_CONCURRENT_TASKS) {
      throw new Error('Maximum concurrent tasks reached');
    }

    // Load task config
    const taskConfig = await this.loadTaskConfig(repoPath);
    if (!taskConfig) {
      throw new Error('No task configuration found in repository');
    }

    const command = taskConfig.tasks[taskId];
    if (!command) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Create task run
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const taskRun: TaskRun = {
      runId,
      repoId,
      taskId,
      state: 'running',
      startedAt: new Date(),
    };

    const entry: TaskEntry = {
      run: taskRun,
      process: null,
      output: '',
      clients: new Set(),
    };

    this.tasks.set(runId, entry);
    this.runningCount++;

    // Spawn process - NEVER use shell
    const [cmd, ...args] = command;

    try {
      const proc = spawn(cmd, args, {
        cwd: repoPath,
        env: {
          ...process.env,
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TERM: 'xterm-256color',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: DEFAULT_TIMEOUT,
      });

      entry.process = proc;

      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        entry.output += text;

        for (const client of entry.clients) {
          try {
            client.send({ type: 'output', data: text });
          } catch {
            // Ignore send errors
          }
        }
      });

      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        entry.output += text;

        for (const client of entry.clients) {
          try {
            client.send({ type: 'output', data: text });
          } catch {
            // Ignore send errors
          }
        }
      });

      // Handle exit
      proc.on('close', (code, signal) => {
        this.runningCount--;
        taskRun.state = code === 0 ? 'completed' : 'failed';
        taskRun.exitCode = code ?? undefined;
        taskRun.endedAt = new Date();
        entry.process = null;

        for (const client of entry.clients) {
          try {
            client.send({
              type: 'status',
              state: taskRun.state,
              data: `Exit code: ${code}`,
            });
          } catch {
            // Ignore send errors
          }
        }



        // Clean up after some time
        setTimeout(() => {
          this.tasks.delete(runId);
        }, 60000); // Keep for 1 minute after completion
      });

      proc.on('error', (error) => {
        this.runningCount--;
        taskRun.state = 'failed';
        taskRun.endedAt = new Date();
        entry.process = null;

        for (const client of entry.clients) {
          try {
            client.send({
              type: 'status',
              state: 'failed',
              data: error.message,
            });
          } catch {
            // Ignore send errors
          }
        }

        console.error(`Task ${taskId} (${runId}) error:`, error);
      });



    } catch (error: any) {
      this.runningCount--;
      taskRun.state = 'failed';
      taskRun.endedAt = new Date();
      throw error;
    }

    return taskRun;
  }

  /**
   * Stops a running task
   */
  stopTask(runId: string): boolean {
    const entry = this.tasks.get(runId);

    if (!entry || !entry.process) {
      return false;
    }

    entry.process.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (entry.process) {
        entry.process.kill('SIGKILL');
      }
    }, 5000);

    entry.run.state = 'stopped';
    entry.run.endedAt = new Date();

    return true;
  }

  /**
   * Attaches a client to a task's output stream
   */
  attachClient(runId: string, client: TaskClient): { run: TaskRun; output: string } | null {
    const entry = this.tasks.get(runId);

    if (!entry) {
      return null;
    }

    entry.clients.add(client);

    return {
      run: entry.run,
      output: entry.output,
    };
  }

  /**
   * Detaches a client
   */
  detachClient(runId: string, clientId: string): void {
    const entry = this.tasks.get(runId);

    if (!entry) {
      return;
    }

    for (const client of entry.clients) {
      if (client.id === clientId) {
        entry.clients.delete(client);
        break;
      }
    }
  }

  /**
   * Gets a task run
   */
  getTask(runId: string): TaskRun | null {
    return this.tasks.get(runId)?.run || null;
  }

  /**
   * Gets running tasks for a repo
   */
  getRepoTasks(repoId: string): TaskRun[] {
    const runs: TaskRun[] = [];
    for (const entry of this.tasks.values()) {
      if (entry.run.repoId === repoId) {
        runs.push(entry.run);
      }
    }
    return runs;
  }
}

export const taskRunner = new TaskRunner();
