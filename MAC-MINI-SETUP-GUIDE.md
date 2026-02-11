# Log Pose 🧭 - Mac Mini Setup Guide

**Purpose:** Migrate Log Pose from your development laptop to your Mac mini for production deployment

**Estimated time:** 30-60 minutes

---

## Overview

This guide will help you:
1. Set up the Mac mini environment
2. Transfer the code from your laptop
3. Install dependencies and build
4. Configure for production
5. Run as a background service
6. Set up Cloudflare Tunnel

---

## Prerequisites

### On Your Mac Mini
- ✅ macOS (any recent version)
- ✅ Admin access
- ✅ Connected to internet
- ✅ SSH access enabled (optional, but recommended)

### On Your Laptop
- ✅ Log Pose code in working state
- ✅ Access to Mac mini (SSH or file sharing)

---

## Part 1: Prepare the Mac Mini

### Step 1.1: Create a Dedicated User (Recommended)

For security, run Log Pose as a dedicated user, not your main admin user.

```bash
# On Mac mini, open Terminal

# Create a dedicated user for running Log Pose
sudo dscl . -create /Users/remote-dev
sudo dscl . -create /Users/remote-dev UserShell /bin/zsh
sudo dscl . -create /Users/remote-dev RealName "Log Pose Service"
sudo dscl . -create /Users/remote-dev UniqueID 502
sudo dscl . -create /Users/remote-dev PrimaryGroupID 20
sudo dscl . -create /Users/remote-dev NFSHomeDirectory /Users/remote-dev

# Create home directory
sudo mkdir -p /Users/remote-dev
sudo chown remote-dev:staff /Users/remote-dev

# Set password (optional, for manual login if needed)
sudo dscl . -passwd /Users/remote-dev

# Optional: Allow SSH access for this user
sudo dseditgroup -o edit -a remote-dev -t user com.apple.access_ssh
```

**Alternative (Simpler):** Use your existing user account instead of creating `remote-dev`. Just skip this step and replace `remote-dev` with your username in the rest of the guide.

### Step 1.2: Install Homebrew

```bash
# On Mac mini
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Follow the instructions to add Homebrew to your PATH
# Usually something like:
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Step 1.3: Install Required Software

```bash
# Install Node.js 20+
brew install node

# Verify installation
node --version  # Should be v20.x or higher
npm --version

# Install Claude Code CLI
# (If not already installed)
brew install claude

# Verify Claude installation
claude --version

# Install ripgrep (for search functionality)
brew install ripgrep

# Install Git (if not already installed)
brew install git

# Install Cloudflare Tunnel
brew install cloudflare/cloudflare/cloudflared
```

### Step 1.4: Create Project Directory

```bash
# Create directory for the project
# If using remote-dev user:
sudo mkdir -p /Users/remote-dev/log-pose
sudo chown remote-dev:staff /Users/remote-dev/log-pose

# If using your own user:
mkdir -p ~/log-pose
cd ~/log-pose
```

---

## Part 2: Transfer Code from Laptop to Mac Mini

### Option A: Using rsync (Recommended if SSH is enabled)

**On your laptop:**

```bash
# Navigate to your Log Pose project
cd /Users/mekari/Documents/project/remote-claude

# Transfer to Mac mini via rsync
# Replace 'macmini.local' with your Mac mini's hostname or IP
# Replace 'yourusername' with your Mac mini username

rsync -avz \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude 'logs' \
  --exclude 'tmp' \
  ./ yourusername@macmini.local:~/log-pose/

# Example with IP address:
# rsync -avz --exclude 'node_modules' --exclude 'dist' ./ yourusername@192.168.1.100:~/log-pose/
```

### Option B: Using Git (Recommended for future updates)

**Option B1: Via GitHub/GitLab**

On your laptop:
```bash
cd /Users/mekari/Documents/project/remote-claude

# Initialize git if not done already
git init
git add .
git commit -m "Initial commit - Log Pose 🧭"

# Push to GitHub (create a private repo first)
git remote add origin https://github.com/yourusername/log-pose.git
git branch -M main
git push -u origin main
```

On Mac mini:
```bash
cd ~/log-pose
git clone https://github.com/yourusername/log-pose.git .
```

**Option B2: Via USB Drive**

1. Copy project folder to USB drive (exclude `node_modules` and `dist`)
2. Plug USB into Mac mini
3. Copy from USB to `~/log-pose`

### Option C: Using AirDrop or File Sharing

1. Compress the project folder (exclude `node_modules` and `dist`)
2. Use AirDrop to send to Mac mini
3. Extract to `~/log-pose`

---

## Part 3: Install Dependencies & Build

**On Mac mini:**

```bash
# Navigate to project directory
cd ~/log-pose

# Install all dependencies
npm install

# Build production bundles
npm run build

# Verify builds completed successfully
ls -la client/dist/
ls -la server/dist/
```

---

## Part 4: Configure Environment

### Step 4.1: Create Production Environment File

```bash
# Navigate to server directory
cd ~/log-pose/server

# Copy the example environment file
cp .env.example .env

# Edit the .env file
nano .env
```

### Step 4.2: Update Environment Variables

Update these critical settings in `server/.env`:

```bash
# IMPORTANT: Set to production
NODE_ENV=production

# Server settings
PORT=3000
HOST=127.0.0.1

# Repository roots - UPDATE with your actual repo locations on Mac mini
REPO_ROOTS=/Users/yourusername/projects,/Users/yourusername/repos

# Allowlisted email addresses - UPDATE with your emails
ALLOWLIST_EMAILS=your.email@mekari.com,colleague@mekari.com

# Cloudflare Access settings - WAIT for IT team to provide these
# Leave commented out until you receive them
# CF_ACCESS_TEAM_DOMAIN=mekari.cloudflareaccess.com
# CF_ACCESS_AUD=your-audience-tag

# Session limits
MAX_SESSIONS_PER_USER=3
MAX_TOTAL_SESSIONS=20
DISCONNECTED_TTL_MINUTES=20

# File limits
MAX_FILE_SIZE_BYTES=2000000

# Task runner
TASKS_ENABLED=true

# Claude CLI path
# On Mac mini, find the path:
# which claude
# Then update below:
CLAUDE_PATH=/opt/homebrew/bin/claude

# Audit logging (optional but recommended)
AUDIT_LOG_DIR=/Users/yourusername/log-pose/logs/audit
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`)

### Step 4.3: Create Log Directories

```bash
# Create audit log directory
mkdir -p ~/log-pose/logs/audit
chmod 755 ~/log-pose/logs/audit
```

---

## Part 5: Test the Server

### Step 5.1: Test in Development Mode First

```bash
# Temporarily change to development for testing
cd ~/log-pose/server
# Edit .env and change NODE_ENV to development
nano .env
# Change: NODE_ENV=development

# Start the server
npm start
```

**In another terminal on Mac mini:**
```bash
# Test health endpoint
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}

# Test with dev email
curl -H "X-Dev-Email: your.email@mekari.com" http://localhost:3000/api/me
# Should return: {"email":"your.email@mekari.com","displayName":"Dev User"}
```

If both work, stop the server (`Ctrl+C`) and proceed.

### Step 5.2: Switch Back to Production Mode

```bash
# Edit .env again
nano .env
# Change back: NODE_ENV=production

# Try starting in production mode
npm start
```

**Expected behavior:**
- If you haven't configured Cloudflare yet, it will show a warning
- The server will still start, but API requests will require Cloudflare authentication
- This is correct! We'll add Cloudflare next.

Stop the server (`Ctrl+C`) for now.

---

## Part 6: Set Up as a Background Service

### Step 6.1: Update LaunchD Plist File

```bash
cd ~/log-pose/config

# Edit the service file
nano com.logpose.server.plist
```

**Update these paths** to match your actual setup:

```xml
<!-- Find these lines and update the paths -->

<!-- Update username and path -->
<string>/Users/YOURUSERNAME/log-pose/server/dist/index.js</string>

<!-- Update working directory -->
<string>/Users/YOURUSERNAME/log-pose/server</string>

<!-- Update log paths -->
<string>/Users/YOURUSERNAME/log-pose/logs/server.log</string>
<string>/Users/YOURUSERNAME/log-pose/logs/server.error.log</string>

<!-- Update username -->
<key>UserName</key>
<string>YOURUSERNAME</string>
```

Save and exit.

### Step 6.2: Install the Service

```bash
# Copy the plist to LaunchDaemons
sudo cp ~/log-pose/config/com.logpose.server.plist /Library/LaunchDaemons/

# Set proper permissions
sudo chown root:wheel /Library/LaunchDaemons/com.logpose.server.plist
sudo chmod 644 /Library/LaunchDaemons/com.logpose.server.plist

# Load the service
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist

# Check if it's running
sudo launchctl list | grep logpose
```

**You should see output like:**
```
12345   0       com.logpose.server
```

### Step 6.3: Verify Service is Running

```bash
# Check server logs
tail -f ~/log-pose/logs/server.log

# Test the server
curl http://localhost:3000/health
```

**If something goes wrong:**
```bash
# Stop the service
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist

# Check error logs
cat ~/log-pose/logs/server.error.log

# Fix the issue, then restart
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist
```

---

## Part 7: Set Up Cloudflare Tunnel

### Step 7.1: Wait for IT Team Response

Before proceeding, you need IT to:
1. ✅ Create Cloudflare Tunnel credentials
2. ✅ Set up Cloudflare Access application
3. ✅ Provide you with:
   - Tunnel ID
   - Tunnel credentials JSON file
   - Team domain (e.g., `mekari.cloudflareaccess.com`)
   - Application audience tag (AUD)
   - Hostname (e.g., `logpose.mekari.io`)

**Send them the `CLOUDFLARE-SETUP-REQUEST.md` file if you haven't already.**

### Step 7.2: Configure Cloudflare Tunnel (After IT Provides Details)

**Once you receive the details from IT:**

```bash
# Authenticate with Cloudflare (only needed once)
cloudflared tunnel login
# This will open a browser - follow the instructions

# Create .cloudflared directory
mkdir -p ~/.cloudflared

# IT should provide a credentials JSON file
# Copy it to ~/.cloudflared/YOUR_TUNNEL_ID.json
# Example:
cp ~/Downloads/abc123-tunnel-credentials.json ~/.cloudflared/abc123.json

# Edit the tunnel config
nano ~/.cloudflared/config.yml
```

**Add this configuration:**

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOURUSERNAME/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  # Route to your Log Pose server
  - hostname: logpose.mekari.io
    service: http://127.0.0.1:3000
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s

  # Catch-all rule (required)
  - service: http_status:404
```

Save and exit.

### Step 7.3: Update Server Environment with Cloudflare Details

```bash
# Edit server .env
nano ~/log-pose/server/.env
```

**Uncomment and update these lines:**
```bash
CF_ACCESS_TEAM_DOMAIN=mekari.cloudflareaccess.com
CF_ACCESS_AUD=your-audience-tag-from-IT
```

Save and exit.

**Restart the Log Pose service:**
```bash
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist
```

### Step 7.4: Start Cloudflare Tunnel

**Test the tunnel first:**
```bash
cloudflared tunnel run log-pose
```

If it works, set it up as a service:

```bash
# Install as a service
sudo cloudflared service install

# Start the service
sudo launchctl start com.cloudflare.cloudflared

# Check status
sudo launchctl list | grep cloudflare
```

### Step 7.5: Test Production Access

**From your laptop or phone:**

1. Open browser and go to `https://logpose.mekari.io`
2. Should redirect to Google Workspace login
3. Login with your allowlisted email
4. Should see the Log Pose interface! 🎉

---

## Part 8: Final Verification Checklist

- [ ] Mac mini is accessible (SSH or local)
- [ ] Node.js 20+ installed (`node --version`)
- [ ] Claude CLI installed (`claude --version`)
- [ ] Ripgrep installed (`rg --version`)
- [ ] Code transferred to Mac mini
- [ ] Dependencies installed (`npm install` completed)
- [ ] Production build successful (`npm run build` completed)
- [ ] Environment configured (`server/.env` updated)
- [ ] Server runs manually (`npm start` works)
- [ ] LaunchD service installed and running
- [ ] Server responds to health check (`curl http://localhost:3000/health`)
- [ ] Cloudflare Tunnel configured (after IT provides details)
- [ ] Cloudflare Access works (redirects to Google login)
- [ ] Can access from browser at production URL
- [ ] Can browse repositories
- [ ] Claude terminal works
- [ ] File editing works
- [ ] Search works

---

## Common Issues & Solutions

### Issue: npm install fails on Mac mini

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and try again
rm -rf node_modules package-lock.json
npm install
```

### Issue: Server won't start - "CF_ACCESS_AUD must be set"

**Solution:** This is expected before Cloudflare is configured. Either:
1. Wait for IT to provide Cloudflare details and add them to `.env`
2. Temporarily test in development mode: `NODE_ENV=development`

### Issue: Can't connect to Mac mini via SSH

**Solution:**
```bash
# On Mac mini, enable Remote Login
# System Preferences → Sharing → Remote Login
# Or via command:
sudo systemsetup -setremotelogin on
```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Find what's using port 3000
lsof -ti:3000

# Kill the process
kill $(lsof -ti:3000)

# Or change the port in .env
# PORT=3001
```

### Issue: Claude command not found

**Solution:**
```bash
# Install Claude CLI
brew install claude

# Or if already installed, find its path
which claude

# Update CLAUDE_PATH in .env with the full path
```

### Issue: Permissions errors with LaunchD

**Solution:**
```bash
# Make sure plist is owned by root
sudo chown root:wheel /Library/LaunchDaemons/com.logpose.server.plist
sudo chmod 644 /Library/LaunchDaemons/com.logpose.server.plist

# Check logs for specific errors
cat ~/log-pose/logs/server.error.log
```

---

## Maintenance Commands

### Start/Stop Service

```bash
# Stop Log Pose service
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist

# Start Log Pose service
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist

# Restart (stop then start)
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist
```

### View Logs

```bash
# Server logs
tail -f ~/log-pose/logs/server.log

# Error logs
tail -f ~/log-pose/logs/server.error.log

# Audit logs
tail -f ~/log-pose/logs/audit/$(ls -t ~/log-pose/logs/audit/ | head -1)
```

### Update Code

```bash
# If using Git
cd ~/log-pose
git pull origin main
npm install
npm run build

# Restart service
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist
```

---

## Security Reminders

- ✅ Never commit `.env` files to Git
- ✅ Keep `ALLOWLIST_EMAILS` updated with only current team members
- ✅ Review audit logs regularly: `ls -lh ~/log-pose/logs/audit/`
- ✅ Update dependencies monthly: `npm update && npm audit fix`
- ✅ Keep macOS and Homebrew updated
- ✅ Use Cloudflare Access - don't disable it
- ✅ Don't share your Cloudflare credentials

---

## Quick Reference

### Important Paths on Mac Mini
```
~/log-pose/                          # Project root
~/log-pose/server/.env               # Environment configuration
~/log-pose/logs/                     # Log files
~/.cloudflared/config.yml            # Cloudflare Tunnel config
/Library/LaunchDaemons/com.logpose.server.plist  # Service config
```

### Important Commands
```bash
# Restart server
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist && \
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist

# View logs
tail -f ~/log-pose/logs/server.log

# Test health
curl http://localhost:3000/health

# Check if running
sudo launchctl list | grep logpose
```

---

## Next Steps After Setup

1. **Test thoroughly** - Try all features (file browsing, editing, Claude terminal, search)
2. **Share with team** - Send them the URL: `https://logpose.mekari.io`
3. **Add to team docs** - Document the URL and how to access
4. **Set up monitoring** (optional) - Set up alerts for service downtime
5. **Plan for updates** - Decide on update schedule (weekly, monthly)

---

## 🎉 You're Done!

Your Log Pose compass is now set up on the Mac mini and pointing you back home! ⚓🧭

Access it from anywhere at: `https://logpose.mekari.io`

Questions? Check the troubleshooting section or review the main README.
