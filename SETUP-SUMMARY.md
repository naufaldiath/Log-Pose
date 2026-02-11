# Log Pose 🧭 - Setup Summary

**Quick visual overview of the migration process**

---

## The Journey: Laptop → Mac Mini → Production

```
┌─────────────────┐
│  Your Laptop    │  ← You are here
│  (Development)  │
└────────┬────────┘
         │
         │ Transfer code
         │ (rsync/git/usb)
         ▼
┌─────────────────┐
│    Mac Mini     │
│   (Local Dev)   │
│                 │
│ 1. Install deps │
│ 2. Build        │
│ 3. Configure    │
│ 4. Test         │
└────────┬────────┘
         │
         │ Set up service
         │ (LaunchD)
         ▼
┌─────────────────┐
│    Mac Mini     │
│  (Background)   │
│                 │
│ Server runs     │
│ automatically   │
└────────┬────────┘
         │
         │ Connect Cloudflare
         │ Tunnel (from IT)
         ▼
┌─────────────────────────────────┐
│        Production 🌐            │
│                                 │
│  https://logpose.mekari.io      │
│                                 │
│  ┌──────────────────────┐       │
│  │  Cloudflare Access   │       │
│  │  (Google SSO)        │       │
│  └──────────┬───────────┘       │
│             │                   │
│             ▼                   │
│  ┌──────────────────────┐       │
│  │    Log Pose App      │       │
│  │  ┌────────────────┐  │       │
│  │  │ File Browser   │  │       │
│  │  │ Claude Terminal│  │       │
│  │  │ Code Editor    │  │       │
│  │  │ Search         │  │       │
│  │  └────────────────┘  │       │
│  └──────────────────────┘       │
│                                 │
│  Accessible from:               │
│  📱 Phone                       │
│  💻 Laptop                      │
│  🖥️  Any device with internet   │
└─────────────────────────────────┘
```

---

## What You Need

### On Your Laptop (Now)
```
✅ Log Pose code (current directory)
✅ Access to Mac mini (SSH, network, or physical)
```

### On Mac Mini (To Install)
```
📦 Homebrew
📦 Node.js 20+
📦 Claude CLI
📦 ripgrep
📦 Git
📦 Cloudflare Tunnel
```

### From IT Team (Request via CLOUDFLARE-SETUP-REQUEST.md)
```
🔐 Cloudflare Tunnel ID
🔐 Tunnel credentials JSON
🔐 Team domain (e.g., mekari.cloudflareaccess.com)
🔐 Audience tag (AUD)
🌐 Hostname (e.g., logpose.mekari.io)
```

---

## The 3 Phases

### Phase 1: Transfer & Build ⏱️ ~20 min
```bash
Mac Mini → Install tools → Transfer code → Build
```
**Result:** Log Pose code ready on Mac mini

### Phase 2: Run as Service ⏱️ ~10 min
```bash
Mac Mini → Configure → Set up LaunchD → Test locally
```
**Result:** Server runs automatically in background

### Phase 3: Go Live 🌐 ⏱️ ~15 min + IT time
```bash
Mac Mini → Configure Cloudflare → Connect tunnel → Test production
```
**Result:** Accessible from anywhere via HTTPS

---

## File Locations After Setup

### On Mac Mini
```
~/log-pose/
├── client/               # Frontend code
│   ├── dist/            # Built files
│   └── src/             # Source
├── server/              # Backend code
│   ├── dist/            # Built files
│   ├── src/             # Source
│   └── .env            # ⚠️ CONFIGURATION
├── config/              # Service configs
├── logs/                # Server logs
│   ├── server.log
│   ├── server.error.log
│   └── audit/          # Audit trails
└── docs/                # Documentation

~/.cloudflared/
├── config.yml           # Tunnel config
└── TUNNEL_ID.json      # Credentials

/Library/LaunchDaemons/
└── com.logpose.server.plist  # Service config
```

---

## The Flow: How It All Works

```
┌─────────────┐
│   Browser   │  You access https://logpose.mekari.io
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Cloudflare Access   │  Google SSO login
│ (Identity Check)    │  Email in allowlist?
└──────┬──────────────┘
       │ ✅ Authenticated
       ▼
┌─────────────────────┐
│ Cloudflare Tunnel   │  Secure tunnel to Mac mini
│ (Encrypted)         │  No open ports needed!
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Mac Mini:3000       │  Log Pose server
│ (127.0.0.1 only)    │  Only accessible via tunnel
└──────┬──────────────┘
       │
       ├─ /api/repos   → List repositories
       ├─ /api/file    → Read/write files
       ├─ /api/search  → Search code
       └─ /ws/claude   → Claude terminal
```

**Key Security Points:**
- ✅ No ports open on Mac mini (tunnel only)
- ✅ Google Workspace SSO required
- ✅ Email allowlist enforced
- ✅ All traffic encrypted (HTTPS)
- ✅ JWT verification in production
- ✅ Audit logging enabled

---

## What Happens When...

### 🔌 Mac mini restarts?
```
✅ LaunchD automatically starts Log Pose
✅ Cloudflare Tunnel reconnects
✅ No manual intervention needed
```

### 🌐 You access from your phone?
```
1. Open https://logpose.mekari.io
2. Google login appears
3. Enter Mekari email
4. Log Pose loads
5. Use mobile keybar for terminal
```

### 👥 New team member needs access?
```
1. Add their email to ALLOWLIST_EMAILS in .env
2. Restart Log Pose service
3. They can now access
```

### 🔄 You update the code?
```
1. On Mac mini: git pull
2. npm install
3. npm run build
4. Restart service
5. Changes live!
```

---

## Success Criteria

You know it's working when:

- ✅ `curl http://localhost:3000/health` returns OK
- ✅ `sudo launchctl list | grep logpose` shows running
- ✅ `https://logpose.mekari.io` redirects to Google login
- ✅ After login, you see Log Pose interface
- ✅ You can browse your repos
- ✅ Claude terminal responds
- ✅ File editing works
- ✅ Search returns results
- ✅ Works on mobile with keybar

---

## Common Questions

### Q: Can I keep my laptop and Mac mini both running Log Pose?
**A:** Yes! Just use different `.env` configurations. Mac mini for production, laptop for development.

### Q: What if my Mac mini doesn't have a keyboard/monitor?
**A:** That's fine! Use SSH to access it remotely. Everything can be done via terminal.

### Q: Do I need to keep terminal open?
**A:** No! Once set up as LaunchD service, it runs in background automatically.

### Q: What if I'm not home and Mac mini loses power?
**A:** When power returns and Mac mini boots, LaunchD will auto-start Log Pose. Just make sure Mac mini is set to auto-start after power loss (System Preferences → Energy Saver).

### Q: Can multiple people use it at the same time?
**A:** Yes! Each user gets their own Claude session. Configured for up to 20 concurrent sessions.

### Q: How do I update allowlisted emails?
**A:** Edit `~/log-pose/server/.env`, update `ALLOWLIST_EMAILS`, then restart the service.

---

## Next Steps

1. **Read:** MAC-MINI-SETUP-GUIDE.md (detailed instructions)
2. **Use:** QUICK-SETUP-CHECKLIST.md (step-by-step)
3. **Send:** CLOUDFLARE-SETUP-REQUEST.md (to IT team)
4. **Deploy:** Follow the guides!
5. **Enjoy:** Access your code from anywhere 🎉

---

## 📞 Help Resources

**Guides Available:**
- `MAC-MINI-SETUP-GUIDE.md` - Detailed setup instructions
- `QUICK-SETUP-CHECKLIST.md` - Quick checklist format
- `PRODUCTION-DEPLOYMENT.md` - Production configuration
- `CLOUDFLARE-SETUP-REQUEST.md` - IT team request
- `README.md` - General overview
- `SECURITY-FIXES-SUMMARY.md` - Security details

**Troubleshooting:**
- Check logs: `tail -f ~/log-pose/logs/server.log`
- Check errors: `cat ~/log-pose/logs/server.error.log`
- Check service: `sudo launchctl list | grep logpose`
- Check health: `curl http://localhost:3000/health`

---

**🧭 Your compass is ready to guide you home!**

