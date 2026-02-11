# Log Pose 🧭

> *"In the Grand Line, a normal compass is useless. You need a Log Pose - a compass that always points to the next island."*

**Log Pose** is your compass back home to your Mac mini development environment, no matter where you are.

A secure, mobile-friendly web application that provides:

1. **Code browsing and editing** for repositories on your Mac mini
2. **Interactive Claude Code terminal** running in a real PTY
3. **Whitelisted task runner** for common workflows

## Features

- 🔐 **Secure access** via Cloudflare Access + Google Workspace SSO
- 📱 **Mobile-friendly** with touch-optimized key bar
- 🖥️ **Full terminal** - Claude Code runs interactively, not headless
- 📁 **File explorer** with tree view, search, and editor
- 🔄 **Git integration** - status, diff, log views
- ⚡ **Task runner** - run whitelisted commands (test, lint, build)

## Prerequisites

- macOS (tested on Mac mini M1/M2)
- Node.js 20+
- Claude Code CLI installed (`claude`)
- ripgrep installed (`brew install ripgrep`)
- Cloudflare account with Access configured

## The Story Behind the Name

At Mekari, we name our internal tools after One Piece references. **Log Pose** is the special compass used in the Grand Line - it doesn't point north, it points to your destination island.

This app does exactly that: no matter where you are (commuting, at a coffee shop, on your phone), **Log Pose** always points you back home to your Mac mini and your projects. It's your navigation compass to your development world.

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url> log-pose
cd log-pose
npm install
```

### 2. Configure Environment

```bash
cp server/.env.example server/.env
# Edit server/.env with your settings
```

Required settings:
- `REPO_ROOTS` - Directories containing your repositories
- `ALLOWLIST_EMAILS` - Email addresses allowed to access

### 3. Development Mode

```bash
# Start both server and client in development
npm run dev
```

The app will be available at http://localhost:5173

For testing auth in development, add a header:
```
X-Dev-Email: your@email.com
```

### 4. Production Build

```bash
# Build both server and client
npm run build

# Start production server
npm start
```

## Deployment

### Setting up Cloudflare Tunnel

1. Install cloudflared:
```bash
brew install cloudflare/cloudflare/cloudflared
```

2. Authenticate:
```bash
cloudflared tunnel login
```

3. Create tunnel:
```bash
cloudflared tunnel create log-pose
```

4. Configure DNS in Cloudflare dashboard or:
```bash
cloudflared tunnel route dns log-pose logpose.your-domain.com
```

5. Copy and edit the config:
```bash
cp config/cloudflared-config.yml ~/.cloudflared/config.yml
# Edit with your tunnel ID
```

6. Run the tunnel:
```bash
cloudflared tunnel run log-pose
```

### Setting up Cloudflare Access

1. Go to Cloudflare Zero Trust dashboard
2. Create an Access Application for your hostname
3. Configure Google Workspace as Identity Provider
4. Create an Access Group with your allowed emails
5. Add the Access Group to the application policy

### Running as a Service (launchd)

1. Edit the plist file:
```bash
# Update paths in config/com.logpose.server.plist
```

2. Install the service:
```bash
sudo cp config/com.logpose.server.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist
```

3. Check status:
```bash
sudo launchctl list | grep logpose
```

## Task Runner

Create a `.remote-tools.json` in your repository root:

```json
{
  "tasks": {
    "dev": ["pnpm", "dev"],
    "test": ["pnpm", "test"],
    "lint": ["pnpm", "lint"],
    "build": ["pnpm", "build"]
  }
}
```

Tasks appear in the UI and can be triggered without shell access.

## Security Model

### Perimeter Security
- **Cloudflare Access** protects all routes
- Only allowlisted `@mekari.com` emails can access
- JWT verification for defense-in-depth

### Application Security
- **No shell access** - Claude runs as direct PTY process
- **Path safety** - No `..` traversal, symlink escape protection
- **Allowlisted tasks only** - No arbitrary command execution
- **Audit logging** - All actions logged

### Recommendations
- Run as a dedicated macOS user (`remote-dev`)
- Limit filesystem access to repo roots only
- Use strong Cloudflare Access policies
- Regularly review audit logs

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (User)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Access (SSO + Allowlist)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                Mac mini (127.0.0.1:3000)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Fastify Server                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │  REST API   │  │  WebSocket  │  │   Static    │       │  │
│  │  │  /api/*     │  │  /ws/*      │  │   Files     │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │         │                │                                │  │
│  │         ▼                ▼                                │  │
│  │  ┌─────────────┐  ┌─────────────┐                        │  │
│  │  │ File/Search │  │   Claude    │                        │  │
│  │  │ Git/Tasks   │  │    PTY      │                        │  │
│  │  └─────────────┘  └─────────────┘                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

See [API Documentation](./docs/api.md) for full API reference.

## License

MIT
