# Deploy config — authored in Phase 8, applied in Phase 9

These files harden the dashboard backend for the shared droplet that also runs
the **aigraduate.com** blog (Ghost + MySQL + commento + 2 Postgres clusters) on
**1 GB RAM / 1 vCPU**. They are **authored only** — nothing here has been applied
to the box. Phase 9 applies them carefully and separately.

**Overriding rule (SPEC §8.5):** a problem with the dashboard must never harm the
blog or get our IP rate-limited/banned by Hyperliquid. The controls below enforce
least privilege, hard resource ceilings, localhost binding, and strict scoping.

## Files
- `hyperliquid-dashboard.service` — systemd unit (unprivileged user, resource
  caps, sandboxing, localhost bind, prod CORS origin).
- `nginx/api.niminal.xyz.conf` — new, isolated server block (SSE-friendly proxy,
  TLS, rate limits, `server_tokens off`, `/health` not exposed).
- `nginx/rate-limits.conf` — http-context rate-limit zones; drop in `conf.d/`.

## Resource caps — starting recommendations (tune on the box)
Deliberately conservative: the dashboard is tiny and event-driven, so its ceiling
is set well below what the blog needs, leaving the blog comfortable headroom.

| Cap | Value | Rationale |
|---|---|---|
| `MemoryMax` | **160M** | Node baseline (~50–70M) + in-memory cache (single-digit MB) + SQLite fit comfortably; 160M is a hard kill ceiling that leaves ~840M of the 1 GB for Ghost/MySQL/Postgres. |
| `MemoryHigh` | **128M** | Soft throttle — the kernel reclaims/pressures the process at 128M before the hard 160M kill, so transient spikes slow down rather than OOM-kill. |
| `CPUQuota` | **35%** | The poller does one fetch + a small derive every ~2s; 35% of the single vCPU is ample for that and the SSE fan-out, while guaranteeing 65% stays available to the blog under load. |
| `TasksMax` | **64** | Node uses a handful of threads (V8 + libuv pool); 64 is generous for normal operation yet caps runaway thread/process creation. |

If the dashboard ever needs more, raise deliberately and re-check blog headroom —
never remove the ceilings.

## Apply steps (Phase 9 — do NOT run during Phase 8)
1. Create the unprivileged user + data dir:
   - `useradd --system --no-create-home --shell /usr/sbin/nologin hldash`
   - `install -d -o hldash -g hldash /var/lib/hldash` (owns the SQLite file)
   - deploy code to `/opt/hldash/backend` (owned by root/hldash, read-only to the service)
2. Install deps **project-local** only: `cd /opt/hldash/backend && npm ci` (uses the
   committed `package-lock.json`; `better-sqlite3@^11` is prebuilt → no compiler
   toolchain needed). Never `npm install -g`.
3. systemd: copy `hyperliquid-dashboard.service` to `/etc/systemd/system/`, adjust
   `ExecStart` node path if needed, `systemctl daemon-reload && systemctl enable
   --now hyperliquid-dashboard`. Confirm `systemctl show` reports the caps.
4. nginx: copy `nginx/rate-limits.conf` to `/etc/nginx/conf.d/` and
   `nginx/api.niminal.xyz.conf` to the sites dir. **Do not edit any blog block.**
   `nginx -t` before reload.
5. TLS: this box uses **acme.sh** (not certbot). Issue a **separate** cert for
   `api.niminal.xyz` via its own webroot `/var/www/certbot` and `--install-cert`
   to `/etc/letsencrypt/api.niminal.xyz/` — see RUNBOOK.md §4 for exact commands.
   Do not touch the blog's cert, webroot, or renewal.
6. DNS: add an A record `api.niminal.xyz → <droplet IP>` (direct, no buffering CDN
   that would break SSE).
7. Verify end-to-end from the Vercel frontend, then re-check blog health.

## §8.5 control → artifact map
- Node localhost-only; nginx sole door → unit `HOST=127.0.0.1`; nginx `proxy_pass
  127.0.0.1:8765`.
- Dedicated unprivileged user; no blog/DB access → unit `User=hldash` +
  `ProtectSystem=strict`/`ProtectHome`/`PrivateTmp`/scoped `ReadWritePaths`.
- Resource caps so blog can't be starved → unit `MemoryMax`/`CPUQuota`/`TasksMax`.
- nginx `limit_conn`/`limit_req` per IP; small body; read timeouts → server block +
  `rate-limits.conf`.
- App-level max concurrent SSE → 503 → in code (`MAX_SSE_CLIENTS`).
- CORS locked to https://niminal.xyz, GET only → in code (Node), not duplicated.
- No pass-through to Hyperliquid; coin validated vs universe → in code
  (`hlClient` fixed bodies + `/funding-history` allow-list).
- `server_tokens off`; no stack traces; `/health` not public → nginx
  `server_tokens off` + `location = /health { return 404; }`; Node generic errors.
- Firewall: 80/443/22 only; Node port not public → DO cloud firewall (Phase 9) +
  localhost bind keeps 8765 unreachable externally.
