# Remote Claude Code Web Console — Implementation Spec (Mac mini)

**Document type:** Implementation plan / engineering spec  
**Audience:** Builder(s) of the self-hosted web app on a Mac mini  
**Status:** Draft v1  
**Last updated:** 2026-01-28 (Asia/Jakarta)

---

## 1. Summary

Build a **secure, mobile-friendly web app** that lets allowlisted users:

1. **Browse/edit code in repositories** hosted on a Mac mini (file tree + editor + search + basic git views).
2. Use an embedded **interactive Claude Code terminal UI** (Claude runs in a real PTY; streamed to browser).
3. Optionally run **whitelisted project tasks** (test/lint/dev/build) without granting a general shell.

Access is **pure browser** (no client install), protected by **Cloudflare Tunnel + Cloudflare Access** with **Google Workspace SSO**, and restricted to a **Cloudflare-managed allowlist** of `@mekari.com` accounts.

---

## 2. Goals

### 2.1 Functional goals
- **Claude panel is interactive** (true terminal behavior, not “headless chat”).
- **Separate Claude session per user** (no shared sessions).
- Repo tools:
  - Repo picker from configured roots
  - File tree + open/save
  - Search across repo (ripgrep)
  - Basic Git: status/diff/log (safe wrapper)
- Mobile usability:
  - Works in phone browsers with a dedicated keybar and large touch targets
  - Supports disconnect/reconnect without losing context
- Strong access control:
  - Only a small allowlist of emails can access
  - Enforced by Cloudflare Access (SSO)
  - Optional in-app verification of identity headers/JWT
- No full shell access.

### 2.2 Non-goals
- Collaborative real-time editing (multiple users editing same file simultaneously).
- Shared “pair programming” Claude sessions.
- Full replacement for VS Code / remote-SSH.
- Running arbitrary commands via HTTP endpoints (beyond whitelisted tasks).

---

## 3. Assumptions & constraints

- Host OS: **macOS** on a **Mac mini**.
- Claude Code is installed on the host and can run non-interactively only at a basic level; we require interactive PTY.
- Users authenticate via Google Workspace through Cloudflare Access.
- App is exposed through **Cloudflare Tunnel** (no inbound ports opened).
- Allowed repos are under one or more configured root directories (e.g., `/Users/remote-dev/projects`).

---

## 4. Security model

### 4.1 Primary perimeter: Cloudflare Access
- Cloudflare Access App protects the hostname/paths.
- Identity provider: Google Workspace.
- Access policy includes **Cloudflare Access Group allowlist** (explicit emails).

### 4.2 Defense-in-depth: in-app identity verification (recommended)
The app should treat all external requests as potentially untrusted unless Cloudflare headers validate.

**Approach:**
- Read `Cf-Access-Authenticated-User-Email` (and optionally display name).
- **Option A (minimum):** server-side allowlist check on the email.
- **Option B (stronger):** validate `Cf-Access-Jwt-Assertion`:
  - Verify signature against Cloudflare Access public keys.
  - Verify `aud`, `iss`, `exp`.
  - Extract `email` claim and compare to allowlist.

### 4.3 No shell escape
- Claude runs as the **direct PTY process** (not spawned via `zsh -lc ...`).
- If Claude exits, session ends or restarts Claude; **never drop into a shell**.
- Avoid tmux for v1 to reduce “escape hatches” and key interception.

### 4.4 Principle of least privilege
- Run the service as a dedicated macOS user (e.g., `remote-dev`).
- That user only has filesystem access to the configured repo roots.
- Avoid giving this user admin privileges; no passwordless sudo.

### 4.5 Path safety
- All file APIs must:
  - Deny absolute paths
  - Deny `..` traversal
  - Resolve symlinks and ensure the resolved final path stays under repo root
  - Reject non-text/binary content by size/type rules if desired (configurable)

---

## 5. System architecture

### 5.1 Components
1. **Cloudflare Tunnel**  
   Publishes local service `http://127.0.0.1:PORT` to `https://your-hostname`.
2. **Cloudflare Access**  
   Enforces SSO + allowlist. Issues identity headers / JWT assertion.
3. **Web App**
   - Frontend SPA (React recommended)  
     Repo picker, file tree, editor, search, git views, Claude terminal panel
   - Backend API (Node.js recommended)  
     Repo listing, file read/write, search, git wrappers, task runner
   - WebSocket server  
     Streams PTY output to xterm.js; receives keystrokes/resizes

### 5.2 Data flow
- User -> Cloudflare Access -> Web App  
- Frontend -> REST -> Backend  
- Frontend -> WebSocket -> Backend PTY manager -> Claude Code

---

## 6. User experience

### 6.1 Navigation
- **Top bar:** Repo selector, quick open, status indicators
- **Left panel:** File tree (collapsible)
- **Center:** Editor tabs
- **Right/bottom:** Claude terminal panel (dockable)

### 6.2 Mobile layout
- Default: **Claude terminal full screen**
- Slide-in drawer for file tree + repo picker
- Bottom “key bar” always available (see section 10)

### 6.3 Unique visual style: “Midnight Brass”
- Background: deep ink/charcoal, subtle grain
- Accent: brass/amber used sparingly for focus + active states
- Selection: desaturated teal
- Shapes: squared corners, thick borders, “instrument panel” spacing
- Avoid mainstream “AI purple gradient” motifs

---

## 7. Backend API spec

All endpoints require authentication and must verify user allowlist.

### 7.1 Identity
#### `GET /api/me`
Returns the authenticated identity.
```json
{
  "email": "name@mekari.com",
  "displayName": "Name (optional)"
}
```

### 7.2 Repo discovery
#### `GET /api/repos`
Returns repos discoverable under configured roots.
```json
[
  { "repoId": "projects/foo", "name": "foo", "pathHint": "projects/foo" }
]
```

**Implementation notes**
- `repoId` is a stable identifier derived from relative path under root.
- Optionally support a repo “index file” for explicit repos.

### 7.3 File tree
#### `GET /api/tree?repoId=...&path=...`
Returns directory listing.
```json
{
  "path": "src",
  "entries": [
    { "name": "index.ts", "type": "file" },
    { "name": "components", "type": "dir" }
  ]
}
```

### 7.4 File read/write
#### `GET /api/file?repoId=...&path=...`
```json
{ "path": "src/index.ts", "content": "..." }
```

#### `PUT /api/file?repoId=...&path=...`
Body:
```json
{ "content": "..." }
```
Response:
```json
{ "ok": true, "bytesWritten": 1234 }
```

**Notes**
- Enforce max file size (configurable).
- Optionally keep file backups/versions (out of scope v1).

### 7.5 Search
#### `POST /api/search`
Body:
```json
{ "repoId": "...", "query": "mySymbol", "paths": ["src"] }
```
Response:
```json
{
  "matches": [
    { "path": "src/a.ts", "line": 42, "text": "..." }
  ]
}
```

**Implementation**
- Use `rg` (ripgrep) on server with safe argument construction.

### 7.6 Git (safe wrappers)
#### `GET /api/git/status?repoId=...`
Returns parsed status.

#### `GET /api/git/diff?repoId=...&path=...`
Returns diff text.

#### `GET /api/git/log?repoId=...&limit=50`
Returns recent commits.

**Safety**
- No arbitrary git args from client.
- Validate repo is a git repo; degrade gracefully.

---

## 8. Claude PTY session system

### 8.1 Goals
- One Claude session per user per repo.
- Interactive PTY streamed to browser.
- Safe: no shell prompt.
- Reconnect-friendly.

### 8.2 Session identity & limits
Session key: `(userEmail, repoId)`

Config limits:
- `MAX_SESSIONS_PER_USER` (e.g., 3 repos at once)
- `MAX_TOTAL_SESSIONS` (protect host)
- `DISCONNECTED_TTL_MINUTES` (e.g., 20)

### 8.3 PTY spawn rules (no shell)
- Spawn process = `claude` (Claude Code)
- Args = none or minimal safe args
- `cwd` = repoPath
- Env = controlled:
  - inherit baseline env
  - override `HOME` to the service user’s home
  - optionally set `TERM=xterm-256color`

If Claude exits:
- Mark session as `exited`
- Notify clients via websocket `status`
- Require user action to restart (or auto-restart if desired)

### 8.4 WebSocket protocol

Connection:
- `WS /ws/claude?repoId=...`

Client -> server messages:
```json
{ "type": "attach" }
{ "type": "input", "data": "..." }
{ "type": "resize", "cols": 100, "rows": 32 }
{ "type": "ping" }
```

Server -> client messages:
```json
{ "type": "output", "data": "..." }
{ "type": "status", "state": "starting|running|exited", "message": "..." }
{ "type": "pong" }
```

Encoding:
- Use UTF-8 strings for normal output.
- If needed, support binary frames.

### 8.5 Buffering for reconnect (optional but helpful)
Maintain last N KB of output per session (e.g., 128KB).  
On attach, send a “replay” chunk so the terminal isn’t blank.

---

## 9. Whitelisted task runner (optional but recommended)

### 9.1 Purpose
Allow common workflows (test/lint/dev/build) without shell access.

### 9.2 Task definition
Per repo config file: `.remote-tools.json`
```json
{
  "tasks": {
    "dev": ["pnpm", "dev"],
    "test": ["pnpm", "test"],
    "lint": ["pnpm", "lint"]
  }
}
```

### 9.3 API
#### `GET /api/tasks?repoId=...`
Lists available tasks.

#### `POST /api/tasks/run`
Body:
```json
{ "repoId": "...", "taskId": "test" }
```
Response:
```json
{ "runId": "uuid", "state": "running" }
```

#### `WS /ws/tasks?runId=...`
Streams logs (read-only).

#### `POST /api/tasks/stop`
Body:
```json
{ "runId": "uuid" }
```

### 9.4 Safety requirements
- Only allow tasks present in config.
- Spawn with args-array; **never** `sh -c`.
- Enforce timeouts and max concurrent tasks.
- Sandboxed env (optional).

---

## 10. Mobile terminal controls

### 10.1 Key bar (always visible on phone)
Buttons:
- `Esc`, `Tab`, `Ctrl`, `Alt/Meta`, `↑ ↓ ← →`, `PgUp`, `PgDn`
- “Ctrl Lock” toggle
- “Paste” (clipboard -> terminal)
- Font size `- / +`
- “Reconnect” / “Restart Claude” contextual button

### 10.2 Touch behavior
- Tap to focus
- Long-press to select/copy
- Dedicated copy/paste controls (mobile browsers vary)

---

## 11. Frontend details

### 11.1 Tech recommendation
- React + TypeScript
- Editor: Monaco or CodeMirror
- Terminal: xterm.js
- State: simple store (Zustand/Redux optional)

### 11.2 Core screens
- Login is handled by Cloudflare Access (no in-app login screen needed).
- Main workspace:
  - Repo selector
  - File tree
  - Editor
  - Claude panel

### 11.3 Error states
- “Not allowlisted” -> show a friendly block page with support contact.
- “Claude exited” -> show restart button.
- “Repo missing” -> show rescan message.

---

## 12. Logging, auditing, observability

### 12.1 Audit log events
- User authenticated (email)
- Repo opened
- File read/write (path + size; avoid storing full content)
- Search queries (optional; may be sensitive)
- Claude session start/stop
- Task run start/stop + exit code

### 12.2 Operational logs
- Websocket connect/disconnect
- PTY spawn failures
- Resource usage (optional)

### 12.3 Storage
- v1: JSONL log files on disk
- v2: SQLite or external log sink

---

## 13. Deployment

### 13.1 Process management
- Run Node service with:
  - `launchd` (preferred on macOS) or `pm2`
- Bind to `127.0.0.1` only.

### 13.2 Cloudflare Tunnel
- Run `cloudflared` as a service
- Tunnel routes hostname to `http://127.0.0.1:PORT`
- Ensure websockets pass through

### 13.3 Configuration
Use env vars or config file:
- `REPO_ROOTS=/Users/remote-dev/projects,/Users/remote-dev/work`
- `ALLOWLIST_EMAILS=name@mekari.com,person2@mekari.com`
- `MAX_SESSIONS_PER_USER=3`
- `DISCONNECTED_TTL_MINUTES=20`
- `MAX_FILE_SIZE_BYTES=2000000`
- `TASKS_ENABLED=true`

---

## 14. Testing plan

### 14.1 Unit tests
- Path validation (traversal, symlink escapes)
- Repo resolution from repoId
- Allowlist logic
- Task allowlist parsing

### 14.2 Integration tests
- Websocket PTY streaming basic I/O
- Resize handling
- Claude process lifecycle
- Reconnect within TTL

### 14.3 Security tests
- Attempt directory escape via `..`
- Symlink escape attempts
- Large file upload
- Invalid/missing Cloudflare identity headers

### 14.4 Mobile smoke tests
- iOS Safari, Android Chrome:
  - focus, typing, paste
  - keybar shortcuts

---

## 15. Milestones

### Milestone 1 — Secure hello world
- Cloudflare Tunnel + Access configured
- Allowlist works
- App reachable via browser

### Milestone 2 — Claude terminal MVP
- xterm.js terminal
- PTY streaming
- Spawn Claude directly (no shell)
- Basic reconnect within TTL

### Milestone 3 — Repo tools MVP
- Repo picker + file tree
- Open/save in editor
- Ripgrep search

### Milestone 4 — UX polish & hardening
- Mobile keybar
- Audit logs
- Path safety + symlink checks
- Rate limiting

### Milestone 5 — Optional task runner
- `.remote-tools.json` parsing
- run/stop tasks with log streaming

---

## 16. Risks & mitigations

### 16.1 Mobile terminal usability
**Risk:** typing and shortcuts on phones can be painful.  
**Mitigation:** keybar + Ctrl-lock + paste tooling; keep terminal full-screen default on mobile.

### 16.2 Claude session stability
**Risk:** network drops; websocket interruptions.  
**Mitigation:** reconnect TTL + output buffering + keepalive pings.

### 16.3 Security scope creep
**Risk:** adding “just one more command” becomes shell access.  
**Mitigation:** strict “Claude-only PTY” + whitelisted tasks only.

### 16.4 Performance
**Risk:** multiple sessions + searches could tax the Mac mini.  
**Mitigation:** session limits, search throttling, task concurrency limits.

---

## 17. Appendix: Implementation notes

### 17.1 Suggested backend stack
- Node.js + TypeScript
- `ws` or Socket.IO (simple WS preferred)
- `node-pty` for PTY spawning
- `fastify` or `express` for REST
- `zod` for request validation

### 17.2 Suggested frontend stack
- React + TypeScript
- xterm.js
- Monaco/CodeMirror
- Tailwind (custom theme: Midnight Brass)

---

**End of document**
