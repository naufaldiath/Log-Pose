# Cloudflare Setup Request for Log Pose 🧭

**Requested by:** [Your Name]
**Date:** 2026-01-28
**Domain:** mekari.io
**Purpose:** Self-hosted development tool for mobile-friendly code editing and Claude AI access

> **About the name:** Log Pose is a Mekari internal tool named after the One Piece compass that guides pirates through the Grand Line. This tool is our compass back home to our Mac mini development environment, no matter where we are.

---

## What I Need

I'm setting up a secure web application on a Mac mini that allows authenticated Mekari employees to:
- Browse and edit code repositories remotely
- Use Claude Code AI assistant in the browser
- Access from mobile devices

### 1. Cloudflare Tunnel Setup

**I need help creating a Cloudflare Tunnel** to expose my Mac mini (running locally on 127.0.0.1:3000) to a subdomain.

**Preferred subdomain:** `log-pose.mekari.io` (or `claude.mekari.io` if available)

#### Steps needed from IT/Cloudflare admin:

**Option A: Give me tunnel access (Preferred)**
1. Add me to Cloudflare account as a member with Tunnel creation permissions
2. I'll handle the tunnel setup myself using `cloudflared` CLI on my Mac mini

**Option B: IT creates the tunnel**
1. Create a new Cloudflare Tunnel named `log-pose-[myname]`
2. Point it to `http://127.0.0.1:3000`
3. Route DNS: `log-pose.mekari.io` → the tunnel
4. Provide me with:
   - Tunnel ID
   - Tunnel credentials JSON file
   - I'll configure `cloudflared` on my Mac mini

### 2. Cloudflare Access (SSO Protection)

**The app needs to be protected by Cloudflare Access** with Google Workspace SSO.

**Who can access:** Only these email addresses:
- `naufaldi.rifqi@mekari.com`
- `mobile@mekari.com`

#### Steps needed from IT/Cloudflare admin:

1. **Create Cloudflare Access Application:**
   - Name: `Log Pose - [Your Name]`
   - Domain: `log-pose.mekari.io`
   - Type: Self-hosted

2. **Configure Identity Provider:**
   - Provider: Google Workspace
   - (If not already configured for mekari.io)

3. **Create Access Policy:**
   - Policy name: "Allowed Users"
   - Action: Allow
   - Include: Email addresses in list
   - Emails: `naufaldi.rifqi@mekari.com`, `mobile@mekari.com`

4. **Session Duration:** 24 hours (recommended)

5. **Provide me with:**
   - Team domain (e.g., `mekari.cloudflareaccess.com`)
   - Application Audience (AUD) tag
   - I'll add these to my `.env` file

---

## Security Notes

- ✅ App only accessible through Cloudflare Access (SSO required)
- ✅ Allowlisted to specific @mekari.com emails only
- ✅ No shell access exposed (only Claude AI and file editing)
- ✅ Mac mini not directly exposed to internet (tunnel only)
- ✅ All traffic encrypted via Cloudflare

---

## Alternative: Quick Test Access

If the full setup takes time, I can temporarily:
- Test the app locally at `http://localhost:3000` first
- Use Cloudflare quick tunnel (`trycloudflare.com`) for a quick demo (no auth)
- Wait for proper setup before using in production

---

## Technical Details (if needed)

- **Server:** Mac mini (macOS)
- **App:** Node.js/React web application
- **Local port:** 3000 (only binds to 127.0.0.1)
- **Requires:** WebSocket support for terminal streaming
- **Repository:** Documentation available on request

---

## Questions?

Feel free to reach out if you need more details about:
- Security architecture
- Why this is needed
- Technical implementation

Thank you! 🙏
