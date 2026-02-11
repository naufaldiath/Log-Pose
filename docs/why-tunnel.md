# Why Cloudflare Tunnel?

How Log Pose exposes a Mac mini to the internet — and why we chose this approach over the alternatives.

---

## The Problem

Log Pose runs on a Mac mini sitting on a local network. We need to give a small set of trusted users browser access to it from anywhere — including mobile — so they can browse code, edit files, and interact with Claude Code through an interactive terminal.

This means we need to:

1. **Expose an HTTP/WebSocket service to the internet** (the Mac mini isn't publicly addressable)
2. **Authenticate users** before they can reach the app (only allowlisted `@mekari.com` emails)
3. **Encrypt all traffic** end-to-end
4. **Require zero client software** (pure browser, works on any device)

Naive approaches to internet exposure — opening a port on the router, running a VPN — each break one or more of these requirements. The rest of this document explains why.

---

## Alternatives Considered

| Approach | Inbound ports? | Auth built in? | Browser-only? | HTTPS auto? | WebSocket? | Cost |
|---|---|---|---|---|---|---|
| **Port forwarding** | Yes (exposed) | No | Yes | No (manual cert) | Yes | Free |
| **Traditional VPN** (WireGuard/OpenVPN) | Yes (VPN port) | VPN credentials | No (client needed) | N/A | Yes (once connected) | Free |
| **Tailscale** | No | Device identity | No (client needed) | Yes (MagicDNS) | Yes | Free tier available |
| **Reverse SSH tunnel** | No | SSH keys | Yes (with proxy) | No (manual cert) | Fragile | Free |
| **ngrok** | No | Token/OAuth add-on | Yes | Yes | Yes | Paid for custom domain + auth |
| **Cloudflare Tunnel + Access** | No | SSO + allowlist | Yes | Yes | Yes | Free (current usage) |

### Port forwarding (router NAT)

Open port 3000 (or 443) on the router and point it at the Mac mini.

**Why not:** The service is directly exposed to the internet. Every bot, scanner, and attacker can reach it. We'd need to manage TLS certificates ourselves (Let's Encrypt + renewal), implement all authentication in-app from scratch, and handle DDoS protection on our own. A single vulnerability in the Node.js stack would be directly exploitable. This is the highest-risk option.

### Traditional VPN (WireGuard, OpenVPN)

Run a VPN server. Users connect to the VPN first, then access the Mac mini over the private network.

**Why not:** Every user needs VPN client software installed and configured. This breaks the "pure browser, any device" requirement — especially painful on mobile. VPN also grants network-level access (not just app-level), which violates least privilege. Managing VPN credentials and key rotation adds operational overhead.

### Tailscale

Tailscale is a modern, WireGuard-based mesh VPN with zero-config networking. It's excellent for device-to-device connectivity.

**Why not:** Like traditional VPN, it requires a Tailscale client on every user device. There is a Tailscale Funnel feature for public access, but its identity/auth layer is less mature than Cloudflare Access for SSO-based allowlisting. Tailscale is a strong choice for different use cases (dev machine access, internal tools), but doesn't fit our "zero-install browser access with SSO" requirement.

### Reverse SSH tunnel

SSH from the Mac mini to a cloud server, create a reverse tunnel, and run a reverse proxy (nginx) on the cloud server to forward traffic back.

**Why not:** Fragile. SSH tunnels drop on network changes and need supervisor processes to reconnect. WebSocket connections through chained proxies can be unreliable. We'd still need to manage TLS, authentication, and a cloud server. This is a lot of moving parts for what should be a simple tunnel.

### ngrok

ngrok provides instant tunnels with built-in HTTPS. The paid tier supports custom domains and OAuth-based access control.

**Why not:** ngrok's OAuth/SSO integration requires a paid plan, and its access control isn't as tightly integrated with Google Workspace as Cloudflare Access. The free tier generates random subdomains that change on restart. For a production service, this means paying for features that Cloudflare provides for free at our scale. ngrok is great for demos and quick sharing — less ideal as permanent infrastructure.

---

## Why Cloudflare Tunnel + Access

Cloudflare Tunnel (formerly Argo Tunnel) is the approach we chose. Here's what makes it the right fit:

### No inbound ports

The `cloudflared` daemon on the Mac mini initiates an **outbound-only** connection to Cloudflare's edge. No ports are opened on the router or firewall. The Mac mini is invisible to port scanners. Even if someone knows the machine's IP, there's nothing to connect to.

This is the single biggest security advantage — it eliminates an entire class of attack (direct network exploitation of the host).

### Zero-trust identity layer

Cloudflare Access sits in front of the tunnel and enforces authentication **before any request reaches our server**. The flow:

1. User visits `https://logpose.example.com`
2. Cloudflare Access intercepts the request
3. User authenticates via Google Workspace SSO
4. Cloudflare checks the user's email against the Access policy (allowlist)
5. Only if approved: Cloudflare forwards the request through the tunnel to `localhost:3000`
6. Our server receives the request with a signed JWT (`Cf-Access-Jwt-Assertion` header)

Unauthenticated traffic never touches our server. Cloudflare absorbs it at the edge.

### Free for this use case

Cloudflare Tunnel and Cloudflare Access (up to 50 users) are included in the free plan. We're running a small-team internal tool — this fits comfortably within free-tier limits. No monthly costs for tunneling, no per-seat charges for access control.

### Built-in HTTPS and certificate management

Cloudflare handles TLS termination, certificate provisioning, and renewal. We never manage certs on the Mac mini. The local server binds to `127.0.0.1:3000` over plain HTTP — Cloudflare encrypts the public-facing side automatically.

### WebSocket support

Cloudflare Tunnel supports WebSocket connections natively. Our Claude terminal (`/ws/claude`) and task streaming (`/ws/tasks`) endpoints work without any special configuration. This was a hard requirement given our interactive terminal UI.

### No client software

Users need only a browser. No VPN client, no Tailscale app, no SSH keys. This is critical for mobile access — a team member can open their phone browser, authenticate with Google, and start using Claude Code immediately.

### DDoS protection

Cloudflare's network sits in front of our service. While we're not a high-profile DDoS target, having edge-level protection for free is a meaningful bonus.

---

## How It Works in Our Architecture

```
                         INTERNET
                            |
                   +--------v--------+
                   | Cloudflare Edge |
                   |                 |
                   |  1. TLS termin. |
                   |  2. CF Access   |
                   |     (SSO check) |
                   |  3. JWT issued  |
                   +--------+--------+
                            |
                     (outbound conn)
                            |
              +-------------v--------------+
              |  Mac mini (localhost only)  |
              |                            |
              |  cloudflared daemon        |
              |       |                    |
              |       v                    |
              |  localhost:3000            |
              |  (Fastify server)          |
              |       |                    |
              |       +-- JWT verify (jose)|
              |       +-- Email allowlist  |
              |       +-- Path safety      |
              |       +-- No-shell policy  |
              |       |                    |
              |       v                    |
              |  Claude PTY / File APIs    |
              +----------------------------+
```

### Layered authentication

Authentication happens at **two levels**, providing defense-in-depth:

**Layer 1 — Cloudflare Access (edge):**
Cloudflare Access enforces Google Workspace SSO and an email allowlist at the network edge. Requests from non-allowlisted users are rejected before they ever reach our infrastructure. Cloudflare issues a signed JWT (`Cf-Access-Jwt-Assertion`) for every authenticated request.

**Layer 2 — Application (server):**
Our Fastify server independently verifies the Cloudflare JWT using Cloudflare's public keys (via `jose` library). It validates the signature, audience (`CF_ACCESS_AUD`), and expiration. It then checks the email claim against its own in-app allowlist. This means even if someone bypasses Cloudflare (e.g., direct access to the machine's local network), the app still rejects them.

See `server/src/middleware/auth.ts` for the implementation.

### What the tunnel does NOT protect

The tunnel secures the network path. Everything else is our responsibility:

- **Path traversal** — handled by `server/src/utils/path-safety.ts` (denies `..`, resolves symlinks, enforces repo boundaries)
- **Shell escape** — Claude runs as a direct PTY process, never drops to a shell prompt
- **File size limits** — enforced at the API layer
- **Session isolation** — one Claude session per user per repo, with configurable limits
- **Task safety** — only whitelisted commands from `.remote-tools.json`, spawned as arg arrays (never `sh -c`)

---

## Security Implications

The tunnel architecture gives us a strong security posture through layering:

| Layer | What it protects against | Owned by |
|---|---|---|
| Cloudflare Edge (DDoS, TLS) | Network attacks, eavesdropping | Cloudflare |
| Cloudflare Access (SSO) | Unauthorized users reaching the server at all | Cloudflare + Google Workspace |
| In-app JWT verification | Bypassed edge auth, header spoofing | Our server |
| In-app email allowlist | Overly broad access policies | Our server |
| Path safety checks | Directory traversal, symlink escape | Our server |
| No-shell PTY policy | Privilege escalation via terminal | Our server |
| Audit logging | Post-incident investigation | Our server |

The key insight: **Cloudflare handles the hard parts of internet exposure** (TLS, DDoS, identity) while **we handle the hard parts of application security** (authorization, path safety, session management). Neither layer alone is sufficient — together they provide defense-in-depth.

---

## Tradeoffs and Limitations

No architecture is without tradeoffs. Here's an honest assessment:

### Dependency on Cloudflare

Our entire public access path runs through Cloudflare. If Cloudflare has an outage, Log Pose is unreachable. We accept this because:
- Cloudflare's uptime track record is strong
- The alternative (self-hosted edge infrastructure) would be far more complex and expensive
- For an internal dev tool, brief unavailability is acceptable

### Latency overhead

Every request routes through Cloudflare's nearest edge node before reaching the Mac mini. In practice, this adds ~10-50ms depending on user location. For a code editor and terminal, this is imperceptible. WebSocket connections, once established, maintain the same path but the overhead per message is minimal.

### Debugging complexity

When something goes wrong, the request path is: Browser -> Cloudflare Edge -> Tunnel -> Local Server. Debugging requires checking Cloudflare Access logs, tunnel connectivity, and application logs. This is more complex than debugging a directly exposed service, but the tools exist (Cloudflare dashboard, `cloudflared` logs, application audit logs).

### IT coordination required

Setting up Cloudflare Access with Google Workspace SSO requires coordination with whoever manages the Google Workspace and Cloudflare accounts. This is a one-time setup cost, but it does involve multiple teams/people. See the project's setup documentation for the specific steps involved.

### Cloudflare can inspect traffic

Cloudflare terminates TLS at their edge, which means they can theoretically inspect request/response content. For our use case (code editing, Claude interactions), this is an acceptable trust boundary. For applications handling highly sensitive data (medical records, financial secrets), this might warrant additional encryption.

---

## Summary

Cloudflare Tunnel + Access is the right choice for Log Pose because it uniquely satisfies all our requirements — no inbound ports, SSO-based access control, zero client software, free HTTPS, WebSocket support — at zero cost for our team size. The tradeoffs (Cloudflare dependency, slight latency, TLS termination at edge) are acceptable for an internal developer tool.

The alternatives each fail at least one critical requirement: port forwarding lacks security, VPNs require client software, SSH tunnels are fragile, and ngrok costs money for equivalent features.

For setup instructions, see the project's deployment and Cloudflare configuration documentation.
