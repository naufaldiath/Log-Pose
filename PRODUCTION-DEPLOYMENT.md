# Log Pose 🧭 - Production Deployment Guide

**Last Updated:** 2026-01-28
**Status:** Ready for production deployment after IT configures Cloudflare

> *Your compass back home to your Mac mini development environment*

---

## ✅ Security Fixes Completed

All critical and high-priority security vulnerabilities have been fixed:

### Critical Fixes
- ✅ **Removed hardcoded emails** from client source code
- ✅ **Production authentication** now requires Cloudflare JWT with audience validation
- ✅ **Claude path** now uses configuration variable instead of hardcoded path
- ✅ **CORS restricted** to specific localhost origins in development, disabled in production
- ✅ **WebSocket input** size-limited to 64KB per message to prevent DoS
- ✅ **.env.example** updated with production templates (no real credentials)
- ✅ **.gitignore** already excludes .env files
- ✅ **Startup validation** added - server will refuse to start in production without proper configuration

### High Priority Fixes
- ✅ **Search path validation** now uses centralized security function
- ✅ **Terminal dimensions** validated with proper bounds
- ✅ **JWT verification** requires audience tag in production

---

## 📋 Pre-Production Checklist

Before deploying to production, complete these steps:

### 1. Environment Configuration

Update `/Users/mekari/Documents/project/log-pose/server/.env`:

```bash
# Change from development to production
NODE_ENV=production

# Update repository roots to production paths
REPO_ROOTS=/home/youruser/projects,/home/youruser/repos

# Update allowlist with actual emails (comma-separated)
ALLOWLIST_EMAILS=your.email@mekari.com,colleague@mekari.com

# REQUIRED: Add Cloudflare Access configuration
# Get these from IT team after they set up Cloudflare Access
CF_ACCESS_TEAM_DOMAIN=mekari.cloudflareaccess.com
CF_ACCESS_AUD=your-audience-tag-from-cloudflare

# Update Claude path if different from default
CLAUDE_PATH=/usr/local/bin/claude
# Or use the wrapper script:
# CLAUDE_PATH=/path/to/project/server/claude-wrapper.sh

# Optional: Configure audit logging
AUDIT_LOG_DIR=/var/log/log-pose/audit
```

### 2. Cloudflare Setup (Requires IT Team)

Send **CLOUDFLARE-SETUP-REQUEST.md** to your IT/DevOps team. They need to provide:

1. **Tunnel ID** and credentials file
2. **Team Domain** (e.g., `mekari.cloudflareaccess.com`)
3. **Application Audience Tag** (AUD)
4. **Hostname** (e.g., `log-pose.mekari.io`)

Once you receive these, update:
- `server/.env` with `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`
- `~/.cloudflared/config.yml` with tunnel configuration

### 3. Verify Installation

```bash
# Check Claude is installed
which claude
# Should return path like: /usr/local/bin/claude or /opt/homebrew/bin/claude

# Verify ripgrep is installed
which rg
# Should return path like: /usr/local/bin/rg

# Test Claude works
claude --version
```

### 4. Create Audit Log Directory (Optional but Recommended)

```bash
sudo mkdir -p /var/log/log-pose/audit
sudo chown $USER /var/log/log-pose/audit
chmod 755 /var/log/log-pose/audit
```

### 5. Build for Production

```bash
npm run build
```

This builds both client and server with optimizations.

---

## 🚀 Deployment Steps

### Option A: Testing Locally First (Recommended)

1. **Start the server:**
```bash
npm start
```

2. **Verify it starts without errors:**
   - Should see: `✅ Production configuration validated`
   - Should NOT see any configuration errors
   - Server listens on `http://127.0.0.1:3000`

3. **Test API endpoints:**
```bash
# This should fail with 401 (expected - no auth header)
curl http://localhost:3000/api/me

# This should return 200 OK (health check doesn't require auth)
curl http://localhost:3000/health
```

4. **Access via Cloudflare Tunnel** (after IT sets it up):
   - Go to `https://log-pose.mekari.io` (or your configured hostname)
   - Should redirect to Google Workspace login
   - After login, should see the application

### Option B: Running as a Service (launchd on macOS)

1. **Edit the service file:**
```bash
nano config/com.log-pose.server.plist
```

Update paths:
- `WorkingDirectory`: `/Users/youruser/Documents/project/log-pose/server`
- `ProgramArguments`: `/usr/local/bin/node`, `/Users/youruser/Documents/project/log-pose/server/dist/index.js`

2. **Install the service:**
```bash
sudo cp config/com.log-pose.server.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.log-pose.server.plist
```

3. **Check status:**
```bash
sudo launchctl list | grep log-pose
```

4. **View logs:**
```bash
sudo tail -f /var/log/log-pose.log
```

### Option C: Running with PM2 (Alternative)

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
cd server
pm2 start dist/index.js --name log-pose

# Save PM2 configuration
pm2 save

# Enable PM2 to start on boot
pm2 startup
```

---

## 🔒 Security Validation

After deployment, verify security is working:

### 1. Authentication Check

```bash
# Try accessing without authentication (should fail)
curl https://log-pose.mekari.io/api/me

# Should return: Cloudflare Access login page or 401/403 error
```

### 2. Check Server Logs

Look for:
- ✅ `Production configuration validated` on startup
- ✅ No authentication bypass warnings
- ✅ Cloudflare JWT verification is being used
- ❌ Should NOT see "Development mode" or "X-Dev-Email" mentions

### 3. Test in Browser

1. Open `https://log-pose.mekari.io`
2. Should redirect to Google Workspace SSO
3. Login with allowlisted email
4. Should see the application dashboard
5. Try opening a repository
6. Try using Claude terminal

### 4. Verify Access Control

Test with different emails:
- ✅ Allowlisted email: should work
- ❌ Non-allowlisted email: should show "Access Denied"

---

## 🔍 Monitoring & Maintenance

### Check Server Health

```bash
# Health endpoint (no auth required)
curl https://log-pose.mekari.io/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-28T..."}
```

### View Audit Logs

```bash
ls -la /var/log/log-pose/audit/
tail -f /var/log/log-pose/audit/$(ls -t /var/log/log-pose/audit/ | head -1)
```

### Monitor Resource Usage

```bash
# Check running processes
ps aux | grep node

# Check memory usage
top -pid $(pgrep -f 'node.*log-pose')
```

---

## 🐛 Troubleshooting

### Server Won't Start - Configuration Errors

If you see:
```
❌ PRODUCTION CONFIGURATION ERRORS:
  - CF_ACCESS_AUD must be set in production
  - CF_ACCESS_TEAM_DOMAIN must be set in production
```

**Solution:** Update `server/.env` with values from IT team

### Authentication Not Working

**Symptoms:** Always getting "Access Denied" even with allowlisted email

**Check:**
1. Email is in `ALLOWLIST_EMAILS` (comma-separated, no spaces)
2. `CF_ACCESS_TEAM_DOMAIN` matches Cloudflare configuration
3. `CF_ACCESS_AUD` matches your Cloudflare Access application

### Claude Terminal Not Working

**Symptoms:** Terminal shows "Failed to start Claude session"

**Check:**
1. `CLAUDE_PATH` is correct: `which claude`
2. Claude binary is executable: `ls -la $(which claude)`
3. Repository path is accessible
4. Check server logs for PTY spawn errors

### WebSocket Connection Failing

**Symptoms:** Terminal shows "Connecting..." forever

**Check:**
1. Cloudflare Tunnel supports WebSockets (should be enabled by default)
2. Browser console for WebSocket errors
3. Server logs for connection attempts

---

## 📝 Additional Security Recommendations

### 1. Enable Additional Security Headers

Consider adding these to nginx/Cloudflare:
- `Strict-Transport-Security: max-age=31536000`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 2. Regular Updates

```bash
# Update dependencies monthly
npm update
npm audit fix

# Rebuild after updates
npm run build
```

### 3. Backup Configuration

```bash
# Backup .env file (store securely, NOT in git)
cp server/.env server/.env.backup.$(date +%Y%m%d)

# Backup audit logs
tar -czf audit-logs-$(date +%Y%m%d).tar.gz /var/log/log-pose/audit/
```

### 4. Rotate Secrets

Every 90 days:
- Regenerate Cloudflare Access application
- Update allowlist if team members change
- Review audit logs for suspicious activity

---

## 🎯 Next Steps After Deployment

1. **Monitor for 24 hours** - watch logs for errors
2. **Test all features** - file editing, search, git, Claude terminal
3. **Test on mobile** - verify keybar and touch controls work
4. **Document any issues** - create GitHub issues if needed
5. **Share with team** - send access instructions to allowlisted users

---

## 📞 Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review server logs: `/var/log/log-pose.log`
3. Check audit logs: `/var/log/log-pose/audit/`
4. Contact IT team for Cloudflare Access issues
5. Review security audit report: See `SECURITY-AUDIT-REPORT.md` (if needed)

---

## ✅ Production Readiness Status

- ✅ All critical security vulnerabilities fixed
- ✅ Production environment validation implemented
- ✅ Authentication requires Cloudflare JWT in production
- ✅ Input validation with size limits
- ✅ Path traversal protection
- ✅ Command injection prevention
- ✅ CORS restricted to same origin in production
- ⏳ Awaiting Cloudflare Access configuration from IT team

**Estimated Production Readiness: 95%** 🎉

Remaining 5% is just Cloudflare configuration from IT team.
