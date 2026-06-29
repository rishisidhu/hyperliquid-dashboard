# Phase 9 — Deploy / cutover runbook

**Operator runs every command by hand, one at a time, with review. This file is
instructions only — nothing here has been executed.** Order is chosen so the
co-hosted blog (aigraduate.com) is never at risk and every step is verified
before the next. The backend goes up fully **private**, is proven over TLS, and
only then does DNS/Vercel cutover happen. Each step lists: command(s) · what it
does · success check · rollback.

> Overriding rule (§8.5): nothing may harm the blog or get our IP banned by
> Hyperliquid. If any step affects the blog, **STOP and roll back that step.**

---

## 0. Open questions to resolve BEFORE starting (repo can't answer these)

1. **Droplet public IP** — for the DNS A record and SSH. (Kept out of the repo per §11.)
2. **Code transport to the box** — is this repo reachable from the droplet (git clone via HTTPS/deploy key) or should you `rsync`/`scp` from local? Is `/opt/hldash` an acceptable target path?
3. **Node on the box** — installed and ≥ v20? Output of `which node` (for the unit's `ExecStart`)? Is `npm` present for `npm ci`?
4. **nginx layout convention** — does this box use `sites-available/ + sites-enabled/` (symlink) or `conf.d/`? Where do the blog's server blocks live, and does the main `nginx.conf` `include` `conf.d/*.conf` (needed for `rate-limits.conf`)?
5. **certbot setup** — were the blog's certs issued via the **`--nginx` plugin** or **`--webroot`**? If webroot, what path (is `/var/www/certbot` already used, or another)? Is the renewal timer active (`systemctl list-timers | grep certbot`)?
6. **Node port `8765` free?** — confirm no blog service uses it (`ss -ltnp | grep 8765` should be empty).
7. **Vercel** — is the `niminal.xyz` project Git-connected, and to which repo/branch? Is this monorepo pushed there (so Vercel "Root Directory" = `frontend/`)? Do you have access to set env vars + root directory?
8. **Canonical frontend origin** — is the site served only at `https://niminal.xyz` (apex), or also `www.niminal.xyz`? The backend CORS allows **only** `https://niminal.xyz`; if `www` is used it must redirect to apex (or the origin be added).
9. **DO cloud firewall** — current inbound rules (to confirm 80/443/22 only and that `8765` is not exposed).

Placeholders below: `<DROPLET_IP>`, `<NODE_PATH>` (from Q3), `<NGINX_SITES_DIR>` (from Q4), `<WEBROOT>` (from Q5).

---

## 1. Pre-flight — backups & read-only state capture (changes nothing)

### 1a. Note the current Vercel production deployment (rollback anchor)
- **Do:** In the Vercel dashboard → `niminal.xyz` project → Deployments. Record the **current Production deployment** (its commit/URL). Also note the project's current **Git repo, branch, Root Directory, and env vars** (screenshot).
- **Success:** You have the current Production deployment identified and can "Promote/Rollback" to it later.
- **Rollback:** N/A (read-only).

### 1b. Droplet snapshot + blog health baseline
```
# DigitalOcean: take a snapshot (or confirm automated backups exist) before touching the box.
# On the box — capture baseline, change nothing:
uptime && free -m && df -h
ss -ltnp                                  # record listening ports (expect 80/443/22, blog services)
nginx -T > /tmp/nginx-baseline.txt 2>&1   # full effective nginx config (baseline)
systemctl list-timers | grep -i certbot   # confirm renewal timer
curl -sI https://aigraduate.com | head -1 # blog baseline (expect 200/301)
```
- **What it does:** Records a known-good baseline and a restorable snapshot.
- **Success:** Snapshot taken; blog returns its normal status; you have `/tmp/nginx-baseline.txt` and the port list.
- **Rollback:** N/A. (The snapshot itself is the ultimate rollback for the whole box.)

---

## 2. Backend on the droplet — additive, never edits blog config

### 2a. Dedicated unprivileged user + data dir
```
sudo useradd --system --no-create-home --shell /usr/sbin/nologin hldash
sudo install -d -o hldash -g hldash -m 750 /var/lib/hldash
```
- **Does:** Creates the service identity and the only writable dir (SQLite lives here).
- **Success:** `id hldash` works; `/var/lib/hldash` owned by `hldash`.
- **Rollback:** `sudo userdel hldash && sudo rm -rf /var/lib/hldash`.

### 2b. Get the code onto the box (transport per Q2)
```
# Option A — git (if repo reachable from the box):
sudo install -d -o hldash -g hldash /opt/hldash
sudo -u hldash git clone <REPO_URL> /opt/hldash        # then ensure backend/ is at /opt/hldash/backend

# Option B — rsync from local (if not):
rsync -av --exclude node_modules --exclude .next --exclude data \
  ./backend/ <user>@<DROPLET_IP>:/tmp/hldash-backend/
# then on the box:
sudo install -d -o hldash -g hldash /opt/hldash/backend
sudo cp -r /tmp/hldash-backend/* /opt/hldash/backend/ && sudo chown -R hldash:hldash /opt/hldash
```
- **Does:** Places the backend at `/opt/hldash/backend` (read-only to the service under `ProtectSystem=strict`).
- **Success:** `/opt/hldash/backend/src/index.js` and `package.json` present.
- **Rollback:** `sudo rm -rf /opt/hldash`.

### 2c. Install deps project-local (prebuilt — no compiler toolchain)
```
cd /opt/hldash/backend && sudo -u hldash npm ci --omit=dev
```
- **Does:** Installs the exact locked deps (`better-sqlite3@^11` is prebuilt → no build tools needed).
- **Success:** `node -e "require('better-sqlite3')"` runs clean as `hldash`; `node_modules/` present.
- **Rollback:** `sudo rm -rf /opt/hldash/backend/node_modules`.

### 2d. systemd unit → start → verify PRIVATELY (no nginx/DNS yet)
```
# edit ExecStart path if `which node` (Q3) isn't /usr/bin/node
sudo cp /opt/hldash/backend/deploy/hyperliquid-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hyperliquid-dashboard
sudo systemctl status hyperliquid-dashboard --no-pager
systemctl show hyperliquid-dashboard -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax
curl -s http://127.0.0.1:8765/health         # localhost only
ss -ltnp | grep 8765                          # MUST be 127.0.0.1:8765, never 0.0.0.0
```
- **Does:** Runs the hardened service, bound to localhost, with the resource caps.
- **Success:** `active (running)`; caps reported; `/health` returns `{"healthy":true,...}` after ~a few seconds; socket is `127.0.0.1:8765` only.
- **Rollback:** `sudo systemctl disable --now hyperliquid-dashboard && sudo rm /etc/systemd/system/hyperliquid-dashboard.service && sudo systemctl daemon-reload`.
- **Blog check:** unaffected — nothing public changed yet.

### 2e. nginx rate-limit zones (http-context drop-in)
```
sudo cp /opt/hldash/backend/deploy/nginx/rate-limits.conf /etc/nginx/conf.d/hldash-rate-limits.conf
sudo nginx -t
```
- **Does:** Adds the `limit_req`/`limit_conn` zones in http context **without touching blog config**.
- **Success:** `nginx -t` reports syntax OK. **Do NOT reload yet** (the server block in 2f reloads once).
- **Rollback:** `sudo rm /etc/nginx/conf.d/hldash-rate-limits.conf && sudo nginx -t`.
- **Caveat:** If `nginx -t` complains the zones aren't in http context, confirm Q4 (`conf.d/*.conf` is included inside `http{}`).

### 2f. nginx api block — HTTP-only first (for the ACME challenge)
```
sudo install -d -o www-data -g www-data /var/www/certbot     # or match existing <WEBROOT> (Q5)
# Copy the authored block, but TEMPORARILY comment out the entire `server { listen 443 ... }`
# block (the 443 server references a cert that doesn't exist yet):
sudo cp /opt/hldash/backend/deploy/nginx/api.niminal.xyz.conf <NGINX_SITES_DIR>/api.niminal.xyz.conf
sudo nano <NGINX_SITES_DIR>/api.niminal.xyz.conf            # comment the 443 server block for now
# if this box uses sites-enabled symlinks:
sudo ln -s <NGINX_SITES_DIR>/api.niminal.xyz.conf /etc/nginx/sites-enabled/   # only if convention (Q4)
sudo nginx -t && sudo systemctl reload nginx
```
- **Does:** Serves only the port-80 block (ACME webroot + redirect) for `api.niminal.xyz`. New `server_name`, so the blog's vhosts are untouched.
- **Success:** `nginx -t` OK; reload succeeds; **blog still serves** (`curl -sI https://aigraduate.com`).
- **Rollback:** remove the file (+ symlink), `sudo nginx -t && sudo systemctl reload nginx`.

---

## 3. DNS (BigRock) — add the subdomain (does not affect the apex/blog)

- **Do (BigRock DNS panel):** add one record:
  - **Type:** `A`
  - **Host/Name:** `api` (panel may show it as `api.niminal.xyz`)
  - **Value/Points to:** `<DROPLET_IP>`
  - **TTL:** default (e.g. 3600; lower to 300 if you want faster rollback)
  - **Proxy/CDN:** **direct A record — no proxy/CDN** (a buffering proxy breaks SSE).
- **Verify:**
```
dig +short api.niminal.xyz        # must return <DROPLET_IP>
curl -sI http://api.niminal.xyz/.well-known/acme-challenge/test   # reaches nginx (404 is fine)
```
- **Success:** `dig` returns the droplet IP; HTTP reaches the box.
- **Rollback:** delete the A record in BigRock. (The apex `niminal.xyz` → Vercel is a separate record, untouched.)

---

## 4. TLS — separate cert for api.niminal.xyz (never touches blog certs)

```
# Webroot method (preferred — does not edit nginx config). Match <WEBROOT> to Q5.
sudo certbot certonly --webroot -w /var/www/certbot -d api.niminal.xyz
sudo ls /etc/letsencrypt/live/api.niminal.xyz/        # fullchain.pem, privkey.pem
```
- **Does:** Issues an isolated cert for the subdomain only.
- **Success:** Cert files exist; blog certs unchanged (`sudo certbot certificates` lists the new one alongside the blog's, none modified).
- **Rollback:** `sudo certbot delete --cert-name api.niminal.xyz`.
- **Note:** If the blog uses the **`--nginx`** plugin (Q5), the consistent alternative is `sudo certbot --nginx -d api.niminal.xyz` — but webroot is safer here because it won't rewrite any server block. Decide per Q5.

### 4b. Enable the HTTPS block
```
sudo nano <NGINX_SITES_DIR>/api.niminal.xyz.conf     # un-comment the `server { listen 443 ... }` block
sudo nginx -t && sudo systemctl reload nginx
```
- **Success:** `nginx -t` OK; reload OK; blog still healthy.
- **Rollback:** re-comment the 443 block (or remove the file), reload.

---

## 5. Verify the backend over TLS — and that the blog is fine (GATE)

```
curl -s  https://api.niminal.xyz/health                         # expect {"healthy":true,...}
curl -sN https://api.niminal.xyz/stream | head -c 300           # expect SSE: a `data: {...}` frame
curl -s  https://api.niminal.xyz/board | head -c 200            # expect JSON snapshot
curl -s  "https://api.niminal.xyz/funding-history?coin=BTC" | head -c 120   # expect points JSON
curl -s -o /dev/null -w "%{http_code}\n" "https://api.niminal.xyz/funding-history?coin=NOTACOIN"  # 400
curl -s -o /dev/null -w "%{http_code}\n" https://api.niminal.xyz/health   # via nginx: expect 404 (internal)
# CORS preflight-ish check — confirm the allow-origin header is the prod origin:
curl -sI -H "Origin: https://niminal.xyz" https://api.niminal.xyz/board | grep -i access-control-allow-origin
# BLOG MUST STILL BE HEALTHY:
curl -sI https://aigraduate.com | head -1
free -m && uptime          # confirm the box isn't memory/CPU starved
```
- **Success:** stream/board/funding-history work over TLS; `/health` is **404 via nginx** (private) even though it's 200 on localhost; `Access-Control-Allow-Origin: https://niminal.xyz`; **blog returns its normal status and the box has headroom.**
- 🛑 **GATE — STOP HERE if the blog is affected** (down, slow, memory pressure). Roll back §2–4 (disable service, remove nginx files + cert + DNS) and investigate before any cutover. Do not proceed to Vercel.

---

## 6. DO cloud firewall — confirm 80/443/22 only

- **Do:** In DigitalOcean → Networking → Firewalls, confirm inbound rules allow **only** 80 (HTTP), 443 (HTTPS), 22 (SSH, ideally restricted to your IP). Confirm **no rule exposes 8765**.
- **Verify (from OFF the box):** `nc -vz <DROPLET_IP> 8765` should **fail/refuse** (Node port not public). 80/443 succeed.
- **Success:** Only 80/443/22 reachable; 8765 unreachable externally.
- **Rollback:** revert any firewall rule changes (none expected — this is a confirm step).

---

## 7. Vercel frontend cutover (apex niminal.xyz)

> NEXT_PUBLIC_* vars are **inlined at build time** — set the env var BEFORE the production build, or the bundle won't point at the API.

1. **Set the production env var** — Project → Settings → Environment Variables:
   - `NEXT_PUBLIC_STREAM_URL = https://api.niminal.xyz/stream`, scope **Production**.
2. **Point the project at the dashboard frontend** — Project → Settings → Git/Build:
   - Connect the repo/branch (Q7) and set **Root Directory = `frontend`**, Framework Preset = **Next.js** (build/output left at Next defaults; `output:'export'` emits the static site).
3. **Deploy** — trigger a Production deployment (push to the branch or "Redeploy").
4. **Verify:**
```
curl -sI https://niminal.xyz | head -1                  # 200, served by Vercel
# In a browser: load https://niminal.xyz — board streams; top bar shows "live · updated …";
# DevTools Network: EventSource to https://api.niminal.xyz/stream is 200 and streaming;
# no CORS errors in console.
```
- **Success:** niminal.xyz serves the dashboard and streams live from `api.niminal.xyz`; no CORS errors; the heartbeat/board update.
- **Rollback:** Vercel → Deployments → select the previous Production deployment recorded in 1a → **Promote to Production** (instant). If root dir/repo were changed, restore them to the noted values.
- **Caveat (Q8):** if the site also answers on `www.niminal.xyz`, that Origin will be **CORS-blocked** by the backend (allows only the apex). Either redirect `www`→apex at Vercel, or add the origin to `CORS_ORIGIN` on the box and restart the service.

---

## 8. Final end-to-end verification + overall rollback

**End-to-end (after cutover):**
- Browser at `https://niminal.xyz`: board populated, headline strip, live band animating, row-expand shows cross-venue + sparkline, theme toggle works.
- `curl -sI https://aigraduate.com` still healthy; `free -m` shows the box comfortable.
- Re-check `systemctl status hyperliquid-dashboard` (no restarts/OOM) and `journalctl -u hyperliquid-dashboard --since "10 min ago"` (no errors/backoff storms).

**Rollback story (by layer, fastest-first):**
- **Frontend bad:** Vercel → Promote the previous Production deployment (seconds). Blog/backend unaffected.
- **Backend bad:** `sudo systemctl disable --now hyperliquid-dashboard`. The api subdomain stops serving; the blog and apex are untouched. Optionally remove the nginx api file + reload.
- **nginx issue:** remove `api.niminal.xyz.conf` (+ symlink) and `conf.d/hldash-rate-limits.conf`, `sudo nginx -t && sudo systemctl reload nginx` — back to the blog-only baseline (compare against `/tmp/nginx-baseline.txt`).
- **DNS:** delete the `api` A record at BigRock.
- **Cert:** `sudo certbot delete --cert-name api.niminal.xyz` (blog certs never touched).
- **Whole box:** restore the pre-flight DigitalOcean snapshot (1b) — last resort.

Each layer rolls back independently; the blog (aigraduate.com) and the apex DNS
are never modified by this runbook, so the worst case for the dashboard is "the
dashboard is down," never "the blog is down."
