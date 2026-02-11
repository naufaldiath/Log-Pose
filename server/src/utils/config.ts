import { configSchema, type Config } from '../types/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file from server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Parse and validate configuration
function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Invalid configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

export const config = loadConfig();

// Log configuration on startup (redact sensitive values)
export function logConfig(): void {
  console.log('Configuration loaded:');
  console.log(`  PORT: ${config.PORT}`);
  console.log(`  HOST: ${config.HOST}`);
  console.log(`  NODE_ENV: ${config.NODE_ENV}`);
  console.log(`  REPO_ROOTS: ${config.REPO_ROOTS.join(', ')}`);
  console.log(`  ALLOWLIST_EMAILS: ${config.ALLOWLIST_EMAILS.length} emails configured`);
  console.log(`  MAX_SESSIONS_PER_USER: ${config.MAX_SESSIONS_PER_USER}`);
  console.log(`  MAX_TOTAL_SESSIONS: ${config.MAX_TOTAL_SESSIONS}`);
  console.log(`  DISCONNECTED_TTL_MINUTES: ${config.DISCONNECTED_TTL_MINUTES}`);
  console.log(`  MAX_FILE_SIZE_BYTES: ${config.MAX_FILE_SIZE_BYTES}`);
  console.log(`  TASKS_ENABLED: ${config.TASKS_ENABLED}`);
  console.log(`  CLAUDE_PATH: ${config.CLAUDE_PATH}`);
}
