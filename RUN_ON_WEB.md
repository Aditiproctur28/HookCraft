# Put HookCraft on the web from your own PC (free, no card)

This runs the whole app on **your computer** and exposes it to the internet
through a **Cloudflare Tunnel** — a free, secure HTTPS link anyone can open.

```
   USERS' BROWSERS
         │  https://something.trycloudflare.com
         ▼
   ┌─────────────────────┐        ┌──────────────────────────────┐
   │  Cloudflare edge    │  tunnel │  YOUR PC                     │
   │  (free HTTPS URL)   │ ───────▶│  backend on localhost:3010   │
   └─────────────────────┘        │  serves the site + API +     │
                                   │  renders video (Remotion)    │
                                   └──────────────────────────────┘
```

**One public URL** covers everything: the website, the API, and the generated
images/audio/video. The backend serves the built frontend itself (single origin),
so there are no HTTPS "mixed content" problems and nothing to rebuild when the
tunnel URL changes.

> **The trade-off:** your PC must be **on and running the backend** while people
> use the site. Close the laptop → the site goes down. That's the price of $0 /
> no-card. (When you're ready for always-on, the Oracle VM path in DEPLOY.md does
> the same thing on a free cloud machine.)

---

## One-time setup

### 1. Install cloudflared (the tunnel tool)

In **PowerShell**:

```powershell
winget install --id Cloudflare.cloudflared
```

If `winget` isn't available, download `cloudflared-windows-amd64.exe` from
<https://github.com/cloudflare/cloudflared/releases/latest>, rename it to
`cloudflared.exe`, and put it somewhere on your PATH. Verify:

```powershell
cloudflared --version
```

### 2. Make sure your backend secrets are set

`backend/.env` already has your keys and `PORT=3010`. Leave `PUBLIC_BASE` blank
for now — you'll paste the tunnel URL into it each session (Step B below).

---

## Going live (each time you want the site up)

You'll use **two PowerShell windows**: one for the tunnel, one for the backend.

### A. Build the frontend (only needed after you change frontend code)

```powershell
cd d:\HookCraft\frontend
npm run build
```

This regenerates `frontend/dist`, which the backend serves.

### B. Start the tunnel and grab your public URL

In **PowerShell window 1**:

```powershell
cloudflared tunnel --url http://localhost:3010
```

After a second it prints a banner with a line like:

```
https://random-words-here.trycloudflare.com
```

**Copy that URL.** Leave this window running (closing it kills the tunnel).

### C. Point the backend at that URL, then start it

Open `backend/.env` and set:

```
PUBLIC_BASE=https://random-words-here.trycloudflare.com
```

(Use the exact URL from Step B — the `https://` one, no trailing slash.)

Then in **PowerShell window 2**:

```powershell
cd d:\HookCraft\backend
npm start
```

Wait for `Server is locked and loaded on port 3010`.

### D. Open and share

Open the `https://...trycloudflare.com` URL in your browser. The full HookCraft
site loads and works — and you can send that link to anyone.

---

## Shutting down / restarting

- **Stop:** press `Ctrl+C` in both windows (or just close them).
- **Restart later:** repeat Steps B–C. ⚠️ The free `trycloudflare.com` URL is
  **new every time** you start the tunnel, so each session you must:
  1. copy the fresh URL from Step B,
  2. update `PUBLIC_BASE` in `backend/.env`,
  3. (re)start the backend.

  The website itself needs no rebuild for a URL change — only `PUBLIC_BASE`.

---

## Want a permanent URL that never changes?

The random URL is fine for sharing/demos. For a fixed address like
`https://hookcraft.yourname.com`, you'll set up a **named tunnel**, which needs a
free Cloudflare account and a domain name added to Cloudflare (domains cost a few
dollars/year). Once set up, the URL is stable and you never touch `PUBLIC_BASE`
again. Ask me and I'll walk you through it.

---

## Quick reference

| Action | Command |
|--------|---------|
| Install tunnel tool | `winget install --id Cloudflare.cloudflared` |
| Build frontend | `cd d:\HookCraft\frontend; npm run build` |
| Start tunnel (window 1) | `cloudflared tunnel --url http://localhost:3010` |
| Start backend (window 2) | `cd d:\HookCraft\backend; npm start` |
| Health check | open `<tunnel-url>/healthz` |

## Troubleshooting

- **Images/audio/video don't load in the browser** → `PUBLIC_BASE` doesn't match
  the current tunnel URL. Re-copy it from the tunnel window into `backend/.env`
  and restart the backend.
- **"Bad gateway" / 502 on the tunnel URL** → the backend isn't running, or it's
  on a different port than the tunnel (`--url` port must be `3010`).
- **Site loads but API calls fail** → make sure you ran `npm run build` after the
  config changes, so the bundle uses relative (same-origin) API paths.
- **Renders feel slow** → the renderer fetches assets back through the tunnel.
  That's expected; for speed, the local Oracle/own-VM path renders without the
  round-trip.
