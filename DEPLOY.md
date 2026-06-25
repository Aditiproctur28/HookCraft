# Deploying HookCraft to the web

A step-by-step guide written for someone doing this for the first time.

## The big picture

HookCraft is two programs that get deployed to two different places:

```
   USERS' BROWSERS
         │
         ▼
  ┌──────────────┐   API calls    ┌────────────────────────────────┐
  │  FRONTEND    │ ─────────────▶ │  BACKEND                       │
  │  (website)   │                │  (Node + Remotion + ffmpeg)    │
  │              │                │                                │
  │ Cloudflare   │                │  Oracle Cloud free VM (Linux)  │
  │ Pages (free) │                │  runs in a Docker container    │
  └──────────────┘                └────────────────────────────────┘
```

- **Frontend** = static files (built with `npm run build`). Goes on a free static
  host (Cloudflare Pages).
- **Backend** = the heavy worker. It renders video with Remotion (which runs a
  headless Chrome + ffmpeg) and writes files to disk, so it needs a real
  always-on Linux machine. The free **Oracle Cloud VM** is perfect: up to
  4 vCPU / 24 GB RAM, always on, $0.

**End result:** a public website link you can share; the backend running 24/7 on
the VM; your API keys stored safely on the server.

---

## Part A — Create the Oracle Cloud VM (the always-on Linux computer)

1. Go to <https://www.oracle.com/cloud/free/> and sign up. A credit/debit card is
   required **only for identity verification** — the "Always Free" resources are
   genuinely free and won't be charged. Pick a home region close to you.
2. In the Oracle console: **Menu → Compute → Instances → Create instance**.
3. Settings:
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** click *Change shape* → **Ampere (Arm)** → `VM.Standard.A1.Flex`.
     Set **4 OCPUs** and **24 GB memory** (all within the Always-Free limit).
     *(If A1 capacity is unavailable in your region, retry later or pick another
     region — Arm capacity is in high demand.)*
   - **SSH keys:** choose **Generate a key pair for me** and **download both**
     the private and public keys. Keep the private key safe — it's how you log in.
4. Click **Create**. After a minute you'll get a **public IP address** — write it
   down (e.g. `123.45.67.89`). This is your backend's address.

### Open the firewall (so the internet can reach port 3001)

Oracle blocks all inbound ports by default. Open the backend port:

1. On the instance page → **Virtual Cloud Network** → your VCN → **Security Lists**
   → the default security list → **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: **TCP**
   - Destination Port Range: `3001`
   - Save.
2. Ubuntu also has its own firewall. You'll run one command for it in Part C.

---

## Part B — Log into the VM and install Docker

From your Windows machine, open **PowerShell** and connect (replace the key path
and IP):

```powershell
ssh -i C:\path\to\your-private-key.key ubuntu@123.45.67.89
```

> First time it asks "Are you sure you want to continue connecting?" — type `yes`.
> If it complains the key is "too open", that's a Windows permissions quirk; tell
> me and I'll give you the fix.

Now you're "inside" the VM. Install Docker and git:

```bash
sudo apt-get update
sudo apt-get install -y docker.io git
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu          # lets you run docker without sudo
```

Log out and back in once (`exit`, then `ssh ...` again) so the docker group
takes effect.

---

## Part C — Put the code on the VM and run it

### 1. Get the code onto the VM

If your project is on GitHub:

```bash
git clone https://github.com/<you>/HookCraft.git
cd HookCraft
```

> Not on GitHub yet? Easiest path: push it there first (I can help). Alternatively
> you can copy files up with `scp`, but git makes future updates one command.

### 2. Create the secrets file on the VM

The `.env` file holds your API keys and is **never** committed to git, so you
create it directly on the server:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in `GEMINI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, etc.
**Crucially, set `PUBLIC_BASE` to your VM's public URL:**

```
PUBLIC_BASE=http://123.45.67.89:3001
```

Save in nano with `Ctrl+O`, `Enter`, then `Ctrl+X`.

### 3. Open Ubuntu's own firewall for port 3001

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo netfilter-persistent save    # if this command is missing: sudo apt-get install -y iptables-persistent
```

### 4. Build the image and run it

From the repo root (where the `Dockerfile` is):

```bash
docker build -t hookcraft .
```

This takes a few minutes the first time (it installs Chromium + dependencies).
Then run the container:

```bash
docker run -d --name hookcraft \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file backend/.env \
  hookcraft
```

- `-d` = run in background
- `--restart unless-stopped` = auto-restart on crash or VM reboot
- `--env-file` = inject your secrets

Check it's alive:

```bash
docker logs -f hookcraft        # should show "Server is locked and loaded on port 3001"
```

Press `Ctrl+C` to stop watching logs (the container keeps running). Test from
your own browser: open `http://123.45.67.89:3001/` — you should see
*"HookCraft Backend is running smoothly!"*

---

## Part D — Deploy the frontend (the website)

The frontend is already wired to read its backend URL from an env var
(`VITE_API_BASE`), so this is just configuration.

### Using Cloudflare Pages (free)

1. Push your repo to GitHub if you haven't.
2. Go to <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages →
   Connect to Git** → pick your repo.
3. Build settings:
   - **Framework preset:** Vite
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** → add:
   - `VITE_API_BASE` = `http://123.45.67.89:3001`  *(your backend URL)*
5. **Save and Deploy.** In ~1 minute you get a public URL like
   `https://hookcraft.pages.dev`. Open it — the site should load and talk to your
   backend.

---

## Part E — One thing to know about `http` vs `https`

Cloudflare serves your site over **https**, but the backend above is plain
**http**. Browsers block an https page from calling an http API ("mixed content").
Two easy fixes, pick one when you hit it:

- **Quick:** point a free domain/subdomain at the VM and put Caddy in front
  (it auto-gets a free HTTPS certificate). ~10 minutes — I can write the config.
- **Simplest for testing:** also host the frontend on the VM (same origin, no
  mixed-content rule). I can add an Nginx/Caddy step for that.

For first-run testing you can verify the backend works directly via its `http`
URL; we'll add HTTPS as the final polish.

---

## Updating later (after you change code)

```bash
# on the VM
cd HookCraft
git pull
docker build -t hookcraft .
docker rm -f hookcraft
docker run -d --name hookcraft --restart unless-stopped \
  -p 3001:3001 --env-file backend/.env hookcraft
```

The frontend redeploys automatically on every `git push` (Cloudflare watches the
repo).

---

## Notes / gotchas specific to HookCraft

- **Memory:** Remotion renders are RAM-hungry. The 24 GB Arm VM is plenty; the
  single-threaded animation default (`ANIMATION_RENDER_CONCURRENCY=1`) is safe.
  You can raise it on this roomier box if renders feel slow.
- **Disk:** generated files accumulate under `backend/jobs`, `temp_audio`,
  `temp_images`, `public/exports`. On a long-running server add periodic cleanup
  (ask me for a cron job) so the disk doesn't fill.
- **CORS:** the backend currently allows all origins (fine to start). Once your
  frontend URL is fixed, we should lock CORS to just that origin.
- **ffmpeg & Chromium** are baked into the image — nothing to install on the VM
  beyond Docker itself.
