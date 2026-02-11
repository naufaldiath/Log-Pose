# Log Pose 🧭 - Quick Setup Checklist

**Use this checklist when setting up on Mac mini**

---

## ☐ Phase 1: Prepare Mac Mini (10 min)

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install node claude ripgrep git cloudflare/cloudflare/cloudflared

# Verify installations
node --version  # Should be v20+
claude --version
rg --version

# Create project directory
mkdir -p ~/log-pose
```

---

## ☐ Phase 2: Transfer Code (5 min)

**Choose ONE method:**

### Option A: rsync (if SSH enabled)
```bash
# From your laptop
rsync -avz --exclude 'node_modules' --exclude 'dist' \
  ./ yourusername@macmini.local:~/log-pose/
```

### Option B: Git
```bash
# On Mac mini
cd ~/log-pose
git clone https://github.com/yourusername/log-pose.git .
```

### Option C: USB/AirDrop
Copy project folder to Mac mini

---

## ☐ Phase 3: Build (5 min)

```bash
# On Mac mini
cd ~/log-pose
npm install
npm run build

# Verify
ls -la client/dist/ server/dist/
```

---

## ☐ Phase 4: Configure (10 min)

```bash
cd ~/log-pose/server
cp .env.example .env
nano .env
```

**Update these:**
- ✅ `NODE_ENV=production`
- ✅ `REPO_ROOTS=/path/to/your/repos`
- ✅ `ALLOWLIST_EMAILS=your@email.com`
- ✅ `CLAUDE_PATH=/opt/homebrew/bin/claude`
- ⏸️ `CF_ACCESS_TEAM_DOMAIN=` (wait for IT)
- ⏸️ `CF_ACCESS_AUD=` (wait for IT)

```bash
# Create log directory
mkdir -p ~/log-pose/logs/audit
```

---

## ☐ Phase 5: Test Manually (5 min)

```bash
# Start server
cd ~/log-pose
npm start

# In another terminal, test
curl http://localhost:3000/health
# Should return: {"status":"ok",...}

# Stop with Ctrl+C if working
```

---

## ☐ Phase 6: Set Up Service (5 min)

```bash
# Edit plist file
cd ~/log-pose/config
nano com.logpose.server.plist

# Update paths (replace YOURUSERNAME with your actual username):
# - /Users/YOURUSERNAME/log-pose/server/dist/index.js
# - /Users/YOURUSERNAME/log-pose/server
# - /Users/YOURUSERNAME/log-pose/logs/server.log
# - UserName: YOURUSERNAME

# Install service
sudo cp com.logpose.server.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.logpose.server.plist
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist

# Verify running
sudo launchctl list | grep logpose
curl http://localhost:3000/health
```

---

## ☐ Phase 7: Cloudflare Setup (After IT responds)

### 7.1: Send Request to IT
```bash
# Send CLOUDFLARE-SETUP-REQUEST.md to IT team
```

### 7.2: Configure Tunnel (when IT provides credentials)
```bash
# Login to Cloudflare
cloudflared tunnel login

# Save credentials file
mkdir -p ~/.cloudflared
# Copy credentials JSON from IT to ~/.cloudflared/TUNNEL_ID.json

# Create config
nano ~/.cloudflared/config.yml
```

**Add:**
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOURUSERNAME/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: logpose.mekari.io
    service: http://127.0.0.1:3000
  - service: http_status:404
```

### 7.3: Update Server Config
```bash
nano ~/log-pose/server/.env

# Uncomment and update:
# CF_ACCESS_TEAM_DOMAIN=mekari.cloudflareaccess.com
# CF_ACCESS_AUD=your-aud-tag

# Restart server
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist
```

### 7.4: Start Tunnel
```bash
# Test first
cloudflared tunnel run log-pose

# If works, install as service
sudo cloudflared service install
sudo launchctl start com.cloudflare.cloudflared
```

---

## ☐ Phase 8: Test Production (5 min)

### From any device:
1. ✅ Go to `https://logpose.mekari.io`
2. ✅ Redirects to Google Workspace login
3. ✅ Login with allowlisted email
4. ✅ See Log Pose interface
5. ✅ Try browsing a repository
6. ✅ Try opening Claude terminal
7. ✅ Try editing a file
8. ✅ Try searching

---

## 📋 Final Checklist

- [ ] Mac mini accessible
- [ ] All tools installed (node, claude, rg, git, cloudflared)
- [ ] Code transferred to ~/log-pose
- [ ] npm install completed
- [ ] npm run build completed
- [ ] .env configured
- [ ] Log directories created
- [ ] Server runs manually (npm start works)
- [ ] LaunchD service installed and running
- [ ] Health check works (curl localhost:3000/health)
- [ ] IT team contacted for Cloudflare setup
- [ ] Cloudflare credentials received and configured
- [ ] Cloudflare Tunnel running
- [ ] Production URL accessible (https://logpose.mekari.io)
- [ ] Google SSO works
- [ ] All features tested and working

---

## 🆘 Quick Troubleshooting

### Server won't start
```bash
# Check logs
cat ~/log-pose/logs/server.error.log

# Check if port is in use
lsof -ti:3000
```

### Can't access via URL
```bash
# Check if Cloudflare tunnel is running
ps aux | grep cloudflared

# Check server is running
curl http://localhost:3000/health
```

### Permission errors
```bash
# Fix plist ownership
sudo chown root:wheel /Library/LaunchDaemons/com.logpose.server.plist
sudo chmod 644 /Library/LaunchDaemons/com.logpose.server.plist
```

---

## 🔧 Useful Commands

```bash
# Restart Log Pose
sudo launchctl unload /Library/LaunchDaemons/com.logpose.server.plist && \
sudo launchctl load /Library/LaunchDaemons/com.logpose.server.plist

# View logs
tail -f ~/log-pose/logs/server.log

# Check status
sudo launchctl list | grep logpose
curl http://localhost:3000/health
```

---

**Total estimated time:** 45-60 minutes (excluding IT response time)

🎉 **Once complete, you can access Log Pose from anywhere!**
