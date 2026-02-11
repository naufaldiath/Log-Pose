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

# Run server tests only
npm run test --workspace=server
```

The server uses `tsx watch` in dev mode. The client uses Vite with HMR.

## Architecture

This is an **npm workspaces monorepo** with two packages: `server/` and `client/`.

### Server (`server/`)

Node.js + TypeScript + Fastify. ESM modules (`"type": "module"`). Compiled with `tsc` to `server/dist/`.

- **Entry point**: `src/index.ts` — creates Fastify instance, registers plugins (CORS, WebSocket, static), auth middleware, API routes, WS routes
- **`src/middleware/auth.ts`** — Fastify plugin (via `fastify-plugin` for global scope). In production: verifies Cloudflare Access JWT (`jose` library) + email allowlist. In dev: accepts `X-Dev-Email` header or `devEmail` query param
- **`src/routes/api.ts`** — REST endpoints under `/api/*`. All use Zod schemas for request validation. Routes: `/api/me`, `/api/repos`, `/api/tree`, `/api/file` (GET/PUT/DELETE), `/api/search`, `/api/git/{status,diff,log,branches}`, `/api/tasks{/run,/stop,:runId}`
- **`src/routes/ws.ts`** — WebSocket endpoints: `/ws/claude` (Claude terminal), `/ws/tasks` (task log streaming). Messages are JSON with discriminated union types
- **`src/services/claude-session.ts`** — `ClaudeSessionManager` singleton. Manages PTY sessions keyed by `(userEmail, repoId)`. Spawns Claude via `node-pty` through bash (`/bin/bash -c exec claude`). 128KB replay buffer for reconnection. Session limits enforced. Disconnected sessions cleaned up after TTL
- **`src/services/repo.ts`** — Discovers repos under configured `REPO_ROOTS`
- **`src/services/file.ts`** — File CRUD with path safety checks and size limits
- **`src/services/search.ts`** — Wraps `ripgrep` (`rg`) for code search
- **`src/services/git.ts`** — Safe git wrappers via `simple-git` (status, diff, log, branches)
- **`src/services/task-runner.ts`** — Runs whitelisted tasks from per-repo `.remote-tools.json` files
- **`src/services/audit-logger.ts`** — JSONL audit logging for file ops, sessions, searches
- **`src/utils/path-safety.ts`** — `PathSecurityError`, validates relative paths (no `..` traversal, symlink escape detection via `fs.realpath`)
- **`src/utils/config.ts`** — Loads and validates env via Zod (`configSchema` in `types/index.ts`)
- **`src/types/index.ts`** — All shared types: config schema, API response types, WebSocket message types (`ClientMessage`/`ServerMessage`), session types, task types

### Client (`client/`)

React 18 + TypeScript + Vite + Tailwind CSS.

- **`src/App.tsx`** — Root component with auth loading states and responsive layout (sidebar file tree + editor + Claude terminal)
- **`src/stores/app.ts`** — Zustand store for all app state (user, repos, file tree, open files, session state, UI)
- **`src/api/index.ts`** — API client wrapping `fetch`. Auto-attaches `X-Dev-Email` header in dev mode (from `VITE_DEV_EMAIL` env var)
- **Components** (`src/components/`):
  - `ClaudeTerminal.tsx` — xterm.js terminal, manages WebSocket to `/ws/claude`, includes MobileKeyBar
  - `CodeEditor.tsx` — Monaco editor with tab management
  - `FileTree.tsx` — Recursive directory tree
  - `MobileKeyBar.tsx` — Touch-friendly key bar (Esc, Tab, Ctrl, arrows, etc.)
  - `RepoSelector.tsx` — Dropdown to pick active repository
  - `SearchPanel.tsx` — Ripgrep-powered search UI
- **Styling**: "Midnight Brass" theme — custom Tailwind palette with `midnight` (charcoal), `brass` (amber accent), and `teal` (selection) color scales. Monospace font: JetBrains Mono
- Path alias: `@` maps to `client/src/` (configured in both `vite.config.ts` and `tsconfig.json`)

### WebSocket Protocol

Claude terminal (`/ws/claude?repoId=...`):
- Client sends: `attach`, `input`, `resize`, `ping`, `restart`
- Server sends: `output`, `status`, `pong`, `replay`, `error`

Task streaming (`/ws/tasks?runId=...`): read-only output + status

### Security Model

- **Perimeter**: Cloudflare Access (SSO + email allowlist)
- **In-app**: JWT verification (`jose`) in production, email allowlist check at application layer
- **No shell access**: Claude runs as direct PTY process, never drops to shell
- **Path safety**: All file APIs deny `..` traversal, resolve symlinks, enforce repo boundary
- **Tasks**: Only commands from `.remote-tools.json` whitelist, spawned with args-array (never `sh -c`)

## Configuration

Server env vars are in `server/.env` (see `server/.env.example`). Key settings:
- `REPO_ROOTS` — comma-separated absolute paths to repo directories
- `ALLOWLIST_EMAILS` — comma-separated allowed email addresses
- `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` — required in production
- `CLAUDE_PATH` — path to Claude CLI binary (default: `claude`)
- `NODE_ENV` — `development` or `production`

Client env is in `client/.env` (see `client/.env.example`):
- `VITE_DEV_EMAIL` — email sent as `X-Dev-Email` header during local dev

## Dev Workflow

In dev mode, Vite proxies `/api/*` and `/ws/*` to the server at `127.0.0.1:3000`. Set `VITE_DEV_EMAIL` to an email in your `ALLOWLIST_EMAILS` to authenticate locally.

In production, the server serves the built client from `client/dist/` as static files with SPA fallback.

## Deployment

Designed to run on a Mac mini behind Cloudflare Tunnel. The server binds to `127.0.0.1` only. Service management via macOS `launchd` (plist files in `config/`). Requires `node-pty` (native module) and `ripgrep` on the host.
