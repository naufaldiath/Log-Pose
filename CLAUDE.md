# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Log Pose** is a secure, mobile-friendly web app that lets allowlisted users remotely browse/edit code and interact with Claude Code via an interactive terminal on a Mac mini. It is protected by Cloudflare Tunnel + Cloudflare Access with Google Workspace SSO.

## Commands

```bash
# Install dependencies (from root)
npm install

# Development — starts both server (port 3000) and client (port 5173)
npm run dev

# Start only server or client
npm run dev:server
npm run dev:client

# Build everything
npm run build

# Production start (serves built client from server)
npm start

# Lint
npm run lint

# Tests
npm run test
```

The server uses `tsx watch` in dev mode. The client uses Vite with HMR.

## Architecture

This is an **npm workspaces monorepo** with two packages: `server/` and `client/`.

### Server (`server/`)

Node.js + TypeScript + Fastify. ESM modules (`"type": "module"`). Compiled with `tsc` to `server/dist/`.

- **Entry point**: `src/index.ts` — creates Fastify instance, registers plugins (CORS, WebSocket, static), auth middleware, API routes, WS routes

#### Middleware
- **`src/middleware/auth.ts`** — Fastify plugin (via `fastify-plugin`). In production: verifies Cloudflare Access JWT (`jose` library) + email allowlist. In dev: accepts `X-Dev-Email` header or `devEmail` query param. Also handles admin email checks.

#### Routes
- **`src/routes/api.ts`** — REST endpoints under `/api/*`. All use Zod schemas for request validation:
  - `/api/me` — Current user info
  - `/api/repos` — List repositories
  - `/api/tree` — File tree for a repo
  - `/api/file` (GET/PUT/DELETE) — File CRUD
  - `/api/search` — Ripgrep-powered code search
  - `/api/git/{status,diff,log,branches,checkout}` — Git operations
  - `/api/tasks{/run,/stop,:runId}` — Whitelisted task execution
  - `/api/sessions` (GET/POST) — Terminal session management
  - `/api/sessions/:sessionId` (DELETE/PATCH) — Terminate or rename session
  - `/api/sessions/all` — Cross-repo session listing
- **`src/routes/analytics.ts`** — Product analytics endpoints under `/api/analytics/*` (admin only)
- **`src/routes/ws.ts`** — WebSocket endpoints: `/ws/claude` (Claude terminal), `/ws/tasks` (task log streaming). Messages are JSON with discriminated union types

#### Services
- **`src/services/claude-session.ts`** — `ClaudeSessionManager` singleton. Manages PTY sessions keyed by `(userEmail, repoId, branch)`. Spawns Claude via `node-pty` through bash (`/bin/bash -c exec claude`). 128KB replay buffer for reconnection. Session limits enforced (3 per user, 20 total). Disconnected sessions cleaned up after TTL.
- **`src/services/repo.ts`** — Discovers repos under configured `REPO_ROOTS`
- **`src/services/file.ts`** — File CRUD with path safety checks and size limits
- **`src/services/search.ts`** — Wraps `ripgrep` (`rg`) for code search
- **`src/services/git.ts`** — Safe git wrappers via `simple-git` (status, diff, log, branches, checkout)
- **`src/services/task-runner.ts`** — Runs whitelisted tasks from per-repo `.remote-tools.json` files
- **`src/services/audit-logger.ts`** — JSONL audit logging for file ops, sessions, searches
- **`src/services/worktree.ts`** — **NEW**: Git worktree management for per-user branch isolation. Creates isolated worktrees at `.worktrees/{userId}/{branch}/`. Supports user-specific branch naming (`logpose/{short-user-id}/{base-branch}`).
- **`src/services/settings.ts`** — **NEW**: Admin settings management. Runtime allowlist and admin email configuration stored in `data/settings.json`.
- **`src/services/analytics-logger.ts`** — **NEW**: Product analytics logging. Logs 20+ event types (file operations, terminal usage, searches, git operations) to JSONL files.

#### Utilities
- **`src/utils/path-safety.ts`** — `PathSecurityError`, validates relative paths (no `..` traversal, symlink escape detection via `fs.realpath`)
- **`src/utils/config.ts`** — Loads and validates env via Zod (`configSchema` in `types/index.ts`)

#### Types
- **`src/types/index.ts`** — All shared types: config schema, API response types, WebSocket message types (`ClientMessage`/`ServerMessage`), session types, task types
- **`src/types/analytics.ts`** — Analytics-specific types

### Client (`client/`)

React 18 + TypeScript + Vite + Tailwind CSS.

- **`src/App.tsx`** — Root component with auth loading states and responsive layout (sidebar file tree + editor + Claude terminal)
- **`src/stores/app.ts`** — Zustand store for all app state (user, repos, file tree, open files, session state, UI)
- **`src/stores/terminal-tabs.ts`** — **NEW**: Dedicated store for terminal tab management across repositories
- **`src/api/index.ts`** — API client wrapping `fetch`. Auto-attaches `X-Dev-Email` header in dev mode (from `VITE_DEV_EMAIL` env var)

#### Components (`src/components/`)
- `ClaudeTerminal.tsx` — xterm.js terminal, manages WebSocket to `/ws/claude`, includes MobileKeyBar, supports multi-tab interface
- `CodeEditor.tsx` — Monaco editor with tab management
- `FileTree.tsx` — Recursive directory tree
- `MobileKeyBar.tsx` — Touch-friendly key bar (Esc, Tab, Ctrl, arrows, etc.)
- `RepoSelector.tsx` — Dropdown to pick active repository
- `SearchPanel.tsx` — Ripgrep-powered search UI
- `ResizablePanel.tsx` — Draggable panel resizer for sidebar/editor/terminal layout
- `SessionManagerModal.tsx` — **NEW**: Manage terminal sessions across repos, view session limits, terminate/rename sessions
- `AnalyticsDashboard.tsx` — **NEW**: Admin analytics dashboard with time-series data, user activity, feature adoption
- `AdminPanel.tsx` — **NEW**: Web-based admin configuration for allowlist and admin emails
- `BranchSelector.tsx` — **NEW**: Git branch selection with worktree integration

#### Styling
"Midnight Brass" theme — custom Tailwind palette with `midnight` (charcoal), `brass` (amber accent), and `teal` (selection) color scales. Monospace font: JetBrains Mono. Path alias: `@` maps to `client/src/`.

### WebSocket Protocol

**Claude terminal (`/ws/claude?repoId=...&branch=...`)**:
- Client sends: `attach`, `input`, `resize`, `ping`, `restart`
- Server sends: `output`, `status` (includes `sessionName`, `branch`), `pong`, `replay`, `error`

**Task streaming (`/ws/tasks?runId=...`)**: read-only output + status

### Per-User Branch Isolation

Users can work on isolated branches without affecting each other:
- Worktrees are created at `.worktrees/{sanitized-email}/{branch}/`
- Branches use naming convention: `logpose/{short-user-id}/{base-branch}` (e.g., `logpose/abc123/main`)
- Automatic worktree cleanup when sessions terminate
- Branch selector UI shows active worktrees per user

### Security Model

- **Perimeter**: Cloudflare Access (SSO + email allowlist)
- **In-app**: JWT verification (`jose`) in production, email allowlist check at application layer
- **Admin privileges**: Separate admin email list for analytics/settings access
- **No shell access**: Claude runs as direct PTY process, never drops to shell
- **Path safety**: All file APIs deny `..` traversal, resolve symlinks, enforce repo boundary
- **Tasks**: Only commands from `.remote-tools.json` whitelist, spawned with args-array (never `sh -c`)

### Product Analytics

Comprehensive analytics system tracking:
- File operations (open, edit, save)
- Terminal usage (sessions, commands, errors)
- Search usage
- Git operations
- API performance metrics
- User activity over time

Data is stored in JSONL format (`logs/analytics/`). Admin-only access with privacy controls (hashed user IDs).

## Configuration

Server env vars are in `server/.env` (see `server/.env.example`):

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `HOST` | Bind address (default: 127.0.0.1) |
| `NODE_ENV` | `development` or `production` |
| `REPO_ROOTS` | Comma-separated absolute paths to repo directories |
| `ALLOWLIST_EMAILS` | Comma-separated allowed email addresses |
| `ADMIN_EMAILS` | **NEW**: Comma-separated admin emails (defaults to ALLOWLIST_EMAILS) |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain (production) |
| `CF_ACCESS_AUD` | Cloudflare Access AUD tag (production) |
| `MAX_SESSIONS_PER_USER` | Max terminal sessions per user (default: 3) |
| `MAX_TOTAL_SESSIONS` | Max total sessions across all users (default: 20) |
| `DISCONNECTED_TTL_MINUTES` | Cleanup TTL for disconnected sessions (default: 20) |
| `MAX_FILE_SIZE_BYTES` | Max file size for editing (default: 2MB) |
| `TASKS_ENABLED` | Enable task runner (default: true) |
| `CLAUDE_PATH` | Path to Claude CLI binary (default: `claude`) |

Client env is in `client/.env` (see `client/.env.example`):
- `VITE_DEV_EMAIL` — email sent as `X-Dev-Email` header during local dev

## Dev Workflow

In dev mode, Vite proxies `/api/*` and `/ws/*` to the server at `127.0.0.1:3000`. Set `VITE_DEV_EMAIL` to an email in your `ALLOWLIST_EMAILS` to authenticate locally.

In production, the server serves the built client from `client/dist/` as static files with SPA fallback.

## Testing

Tests use Vitest. Run with:
```bash
npm run test
```

## Deployment

Designed to run on a Mac mini behind Cloudflare Tunnel. The server binds to `127.0.0.1` only. Service management via macOS `launchd` (plist files in `config/`). Requires `node-pty` (native module) and `ripgrep` on the host.

Data directories (created at runtime):
- `server/data/` — Runtime settings (`settings.json`)
- `server/logs/audit/` — Audit logs (JSONL)
- `server/logs/analytics/` — Analytics logs (JSONL)
