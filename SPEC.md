# Hyperliquid Crowd-Positioning Dashboard — Product & Technical Spec

*Version 0.3 — draft for build (Claude Code-ready)*

> **How to use this doc:** Section 12 is a living progress log. As Claude Code works through the build phases, it should update the status of each task in §12 (✅ done / 🟡 in progress / 🔴 blocked / ↪️ pivoted) and append notes on any hurdles, decisions, or deviations. The spec above §12 is the *intended* design; §12 is the *actual* record.

---

## 1. One-line summary

A live, web-based dashboard that tells a Hyperliquid perp trader **how crowded each market is, what that crowd is paying to stay in, and how that compares to other exchanges** — using only the free public Hyperliquid API, with a persistent backend on an existing droplet and a static frontend on Vercel served at niminal.xyz, legible enough for a novice via a built-in education layer.

---

## 2. The problem & the user

**User:** someone about to open (or sitting in) a perp position on Hyperliquid. Ranges from semi-casual to fairly sophisticated.

**The real question they have** is not "what's the price" — they have a chart for that. It's:

> *"If I take this trade, am I piling into a crowded, stretched position that's about to get squeezed — or am I early? And what's it costing the crowd to stay in?"*

**Why existing tools don't fully answer this for the median user:**

- **CoinGlass / HyperTracker** show raw long/short *trader counts* and liquidation feeds, but run wallet-indexing infra and the output is dense. A raw count doesn't tell you what to *do*.
- **ASXN (stats.hyperliquid.xyz)** is the comprehensive "everything" board — great, but broad and not opinionated.
- Nobody surfaces, *simply*, **crowd skew + cost-of-carry + cross-venue funding comparison** as one at-a-glance signal — and nobody teaches the novice what it means in-context.

**Our wedge:** be opinionated and legible. One screen, one story per market, education built into the interface.

---

## 3. The core insight the product sells

On a perpetual, **funding rate is the honest, native proxy for crowd positioning**:

- Positive funding → longs pay shorts → the crowd is leaning long, and it's *costing* them.
- The more extreme the funding, the more stretched (and squeeze-vulnerable) the crowd.

We deliberately do **not** fabricate a "long trader count." The public Info API doesn't expose one without aggregating every wallet's `clearinghouseState` (infeasible without an indexer). Choosing the truthful signal over a fakeable one is a deliberate product decision.

---

## 4. What we show (feature scope)

### 4.1 Headline strip (the screenshot moment)
- **Most crowded longs right now** — top N perps by positive funding, weighted by open interest.
- **Most crowded shorts right now** — top N by negative funding.
- Each card carries a one-line plain-language interpretation (see §4.6).

### 4.2 Main board — one row per perp, sortable
| Column | Source field | Notes |
|---|---|---|
| Coin | `universe[].name` | |
| Mark price | `markPx` | |
| 24h change % | derived from `markPx` vs `prevDayPx` | |
| **Funding (annualized)** | `funding` × 24 × 365 | hourly → annualized; color intensity = extremity |
| **Crowd skew badge** | derived from funding sign/magnitude | "Longs crowded / Balanced / Shorts crowded" |
| Open interest | `openInterest` × `markPx` | notional $ |
| **OI trend arrow** | OI now vs stored snapshot ~15–30 min ago | rising vs unwinding — *requires persistence, §5.1* |
| 24h volume | `dayNtlVlm` | |
| Premium | `premium` | mark vs oracle confirmation |
| **OI-cap flag** | `perpsAtOpenInterestCap` | "🚫 can't open more" badge |

### 4.3 Signature feature — cross-venue funding comparison
On row expand / dedicated panel: Hyperliquid funding **side by side with other venues** (Binance, Bybit, etc.) via `predictedFundings`, plus next funding time. The differentiator — directly actionable, rarely rendered simply.

### 4.4 Funding trend sparkline
Per coin, from `fundingHistory` — static number → "crowd getting more or less stretched." Cached a few minutes; **no own persistence needed** (Hyperliquid serves history).

### 4.5 (Optional v2) Sector grouping
Group/filter by category via `perpCategories` / `perpConciseAnnotations`.

### 4.6 Education layer (first-class, not a bolt-on)
The core metric is exactly what a novice doesn't grasp, so teaching *delivers* the "legible" wedge. In-context, progressive disclosure — **not** a separate docs page:

- **Tooltips on every term** (Funding, Premium, OI, Crowd skew, Annualized): one plain sentence + *what it means for a trade*.
- **Skew badge is itself the teaching** — "+43% funding" → "Longs crowded 🔴".
- **"How to read this board" expandable** — one collapsible screen, replaces a separate page.
- **Interpretation microcopy** under headline cards.
- **Tone constraint:** descriptive, never prescriptive. Explain what a number *means*, never "buy/sell." Ethics + credibility line. No financial advice.

---

## 5. Data & persistence

### 5.1 Do we need a database?
**v1: a lightweight local store (SQLite), yes — but no managed database.**

- The board is current-state; a restart re-fetches the snapshot in one call → **no DB for the board itself.**
- **But** the OI trend arrow needs OI now vs ~15–30 min ago, and Hyperliquid doesn't expose historical OI — we record our own snapshots. In-memory works until restart, then arrows blank for 15–30 min.
- The funding sparkline does **not** need our storage (`fundingHistory` endpoint serves it; just cache).

**Decision: SQLite** (single file on the droplet) to persist OI snapshots so trends survive restarts. Append one OI sample/coin every 30–60s; prune > ~1h. Cost $0, no managed service. Rejected: in-memory only (loses trends on restart), managed DB (overkill, breaks the cost story). **Single-writer caveat:** fine for one backend process; only a constraint with multiple backends, which we avoid.

### 5.2 Data sources (all free, public, no API key)
Base URL: `https://api.hyperliquid.xyz`

| Need | Endpoint / channel | Type | Cadence | Note |
|---|---|---|---|---|
| Whole-market snapshot for all perps | `info` `metaAndAssetCtxs` | REST POST | ~2s or stream | one call covers every perp; weight ~2 |
| Live prices | WS `allMids` | WebSocket | push | all mids in one payload |
| Live per-asset ctx | WS `activeAssetCtx` | WebSocket | push | OI/mark/funding share one sub |
| Cross-venue funding | `info` `predictedFundings` | REST POST | ~30–60s | funding updates hourly |
| OI-cap flags | `info` `perpsAtOpenInterestCap` | REST POST | ~30–60s | list of capped coins |
| Funding sparkline | `info` `fundingHistory` | REST POST | on demand / cache 5–10 min | per-coin |
| Sector tags (v2) | `info` `perpCategories` | REST POST | startup, cache hours | near-static |

### 5.3 Honest constraints
- **No public liquidation feed** (only inside per-user `WsUserEvent`) → out of scope, stated openly.
- **No native long/short trader count** → funding is the proxy.
- Funding is hourly → only price/OI feel "live."

---

## 6. Architecture — split frontend/backend

**Reality of our infra (see §7):** niminal.xyz is a Next.js app on **Vercel**; the **droplet** runs the aigraduate.com blog. Our backend is a *persistent* process (long-lived upstream connection + SSE/WebSocket fan-out) — **Vercel's serverless model can't host that**. So we split by workload type:

- **Frontend (static dashboard UI)** → **Vercel**, deployed as the niminal.xyz project. Global CDN, automatic HTTPS, zero frontend ops, DNS unchanged.
- **Backend (persistent poller + fan-out)** → **droplet**, behind the existing nginx, on subdomain **`api.niminal.xyz`**. Tiny, event-driven, co-exists with the blog.

**Principle: upstream footprint is constant regardless of browser count.** One backend talks to Hyperliquid; all clients talk to *us*.

```
        Hyperliquid public API
                 │  (1 connection/poller — NOT per user)
        ┌────────▼──────────────────┐
        │  DROPLET  api.niminal.xyz  │
        │  Node (localhost-only) behind nginx:
        │   - poll metaAndAssetCtxs (~2s)  [WS swap later]
        │   - slow timers: predictedFundings, OI-cap (30–60s)
        │   - in-memory cache = source of truth
        │   - SQLite: rolling OI snapshots (trend arrows)
        │   - derive funding/skew/headlines
        │   - SSE/WebSocket fan-out (CORS locked to niminal.xyz)
        └────────┬───────────────────┘
                 │  https (live data stream)
        ┌────────▼───────────────────┐
        │  VERCEL  niminal.xyz        │
        │  static Next.js dashboard UI│
        │  loads UI from Vercel CDN,  │
        │  streams data from api.*    │
        └────────┬───────────────────┘
                 │
        ┌────────▼─────────┐
        │  N browsers      │
        └──────────────────┘
```

**Why this split (portfolio framing):** it shows judgment about *where each workload belongs* — serverless/edge for static delivery, a long-running box for stateful streaming — and keeps the live blog untouched.

**Cross-origin:** frontend (niminal.xyz) → backend (api.niminal.xyz) is cross-origin. Requires explicit CORS (locked to `https://niminal.xyz`) and TLS on the subdomain. Detailed in §8.

**Stack:**
- Backend: Node single process — `ws` (HL connection), `http` + SSE (fan-out), `better-sqlite3` (OI snapshots). Bound to **127.0.0.1 only**; nginx is the sole public door.
- Frontend: Next.js static export on Vercel. No secrets/keys in client.
- Process mgmt: `pm2` or systemd (auto-restart, run as unprivileged user).

**Resilience:** reconnect-with-backoff to HL; REST fallback if WS drops; serve last-known cache during blips (labeled stale); heartbeat to drop dead client sockets.

---

## 7. Infrastructure we have (corrected)

| Resource | Reality | Implication |
|---|---|---|
| **Droplet** (<DROPLET_IP>) | $6/mo: 1 vCPU shared, 1 GB RAM, 25 GB SSD, 1,000 GiB egress; free monitoring + cloud firewall. **Already runs aigraduate.com (Ghost + MySQL + commento + 2 Postgres clusters) behind nginx.** | Busy but has room for one tiny event-driven Node process. Backend lives here as `api.niminal.xyz`. **Must not disturb the blog** — see §8.5 isolation. |
| **niminal.xyz** | Next.js app on **Vercel**; DNS managed at the registrar; currently resolves to Vercel. To be **replaced** by the dashboard frontend. | Redeploy the Vercel project; apex DNS unchanged. Add one DNS record for `api.niminal.xyz` → droplet IP. |
| Hyperliquid API | Free, public, no key | Zero cost; rate limits sidestepped by fan-out. |

**Capacity:** ~200-perp snapshot is tens of KB; 2s cadence is trivial; per-client deltas smaller; RAM = Node baseline + cache (single-digit MB) + small SQLite file. Ceiling is concurrent socket count (and not starving the blog) — see §8.5.

**Not required:** managed DB, extra droplets, load balancer. Frontend hosting is free on Vercel.

---

## 8. Deployment — niminal.xyz cutover (no droplet blog disruption)

**Goal:** niminal.xyz (Vercel) becomes the dashboard; `api.niminal.xyz` (droplet) serves live data; aigraduate.com untouched.

**Frontend (Vercel):**
1. Back up / archive the existing niminal news app (Git history + a deployment snapshot) before replacing.
2. Point the niminal Vercel project at the new dashboard repo (or replace its source). Redeploy. Apex domain mapping stays as-is.
3. Verify niminal.xyz serves the new UI over HTTPS (Vercel handles TLS).

**Backend subdomain (droplet):**
4. **DNS (BigRock):** add an A record `api.niminal.xyz → <DROPLET_IP>`. (Confirm whether to proxy; for SSE keep it a direct A record, no CDN that buffers streams.)
5. **nginx:** add a *new* server block for `api.niminal.xyz` only — do **not** edit existing aigraduate blocks. `proxy_pass` to the Node process on `127.0.0.1:<port>`. Add SSE-friendly settings (`proxy_buffering off`, long read timeout) and the §8.5 hardening.
6. **TLS:** issue a cert for `api.niminal.xyz` via certbot (separate cert/block; don't touch blog certs).
7. **Service:** run Node under pm2/systemd as an unprivileged user, bound to 127.0.0.1.
8. **Verify** the stream end-to-end from the Vercel frontend, then monitor blog health (it must be unaffected).

**Rollback:** frontend — redeploy previous Vercel build. Backend — disable the `api.niminal.xyz` nginx block and stop the service; nothing else on the box is touched.

---

## 8.5 Security & attack-surface hardening (api.niminal.xyz)

> Exposing a new public endpoint **on the same box as the live blog** — the overriding rule is that a problem with the dashboard must never harm aigraduate.com.

**Threat model (what's actually at risk):** the backend is **read-only** — it reads Hyperliquid and pushes data out; no user input, no writes, no auth, no funds. That removes injection/account/funds risks. The genuine threats:

1. **DoS / resource exhaustion (primary risk).** SSE/WebSocket connections are long-lived and hold memory/sockets; on a 1 GB shared box also running Ghost, a flood could starve the *blog*. Mitigations:
   - nginx `limit_conn` (cap concurrent connections per IP) and `limit_req` (rate-limit new requests per IP).
   - Hard cap on total concurrent SSE/WS clients in the Node app; reject beyond the cap with 503.
   - Idle/socket timeouts; heartbeat to drop dead connections.
   - Small `client_max_body_size` and short header/body read timeouts.
   - **OS-level isolation so the blog can't be starved:** run the Node service under systemd with `MemoryMax=`, `CPUQuota=`, `Tasks Max=` so the dashboard can never consume more than its slice of the 1 GB / 1 vCPU.

2. **Never become an open proxy / SSRF.** The backend talks to Hyperliquid **only on its own fixed schedule**. No endpoint may accept a user-supplied URL, host, or arbitrary upstream parameter that gets forwarded to Hyperliquid (that would let someone use our IP to hammer HL and get *us* rate-limited/banned). Coin/market params, if any, are validated against the known `universe` allow-list — never passed through raw.

3. **CORS locked down.** `Access-Control-Allow-Origin: https://niminal.xyz` only (not `*`), methods limited to GET. Prevents arbitrary sites embedding the feed and piling on load.

4. **No info leakage.** Hide nginx/Node version headers (`server_tokens off`); never return stack traces (generic 500s); do **not** expose the SQLite file, internal `/health`, or metrics publicly (bind health to localhost or protect it). No secrets in the app (there are none — public API).

5. **Blast-radius isolation from the blog.** Node bound to 127.0.0.1 (only nginx reaches it). Runs as a dedicated **unprivileged** user with no access to Ghost/MySQL/Postgres data dirs. Its SQLite file lives in its own directory owned by that user. A compromised or crashed dashboard process cannot touch blog data or DBs.

6. **Firewall.** DO cloud firewall stays minimal: inbound 80, 443, 22 (SSH ideally key-only / restricted) — nothing else. The dashboard's Node port is **not** publicly open (localhost-only).

7. **TLS hygiene.** Valid cert for api.niminal.xyz; HTTPS only; modern ciphers (reuse the blog's good TLS config patterns without editing its blocks).

8. **Abuse signals (nice-to-have v2):** basic per-IP connection logging so unusual fan-out patterns are visible in monitoring; optional Cloudflare in front of niminal.xyz for the static side if abuse appears (note: for the SSE backend, a buffering proxy can break streaming — test before enabling).

**Principle restated:** least privilege, localhost binding, hard resource caps, read-only with no pass-through to upstream, and strict origin/firewall scoping — so the worst case for the dashboard is "the dashboard is down," never "the blog is down" or "our IP is banned by Hyperliquid."

---

## 9. Build phases (high level)

1. Backend core — poll `metaAndAssetCtxs`, in-memory cache, SSE endpoint.
2. Persistence — SQLite OI snapshots + trend derivation.
3. Frontend board — sortable table + headline strip (funding × OI weighted).
4. OI trend UI — arrows + "warming up" state.
5. Signature feature — `predictedFundings` panel + `fundingHistory` sparklines.
6. Education layer — tooltips, skew copy, "how to read", microcopy; descriptive-only.
7. Polish — OI-cap flags, reconnect/backoff, stale labeling.
8. **Security hardening** — implement all §8.5 controls; verify Node is localhost-only, CORS locked, resource caps active, no info leakage.
9. **Deploy / cutover** — Vercel frontend replace + `api.niminal.xyz` backend per §8; verify blog unaffected.
10. (v2) sector grouping, alerts, mobile, abuse logging.

---

## 10. What this demonstrates (portfolio framing)

- **Product thinking:** widest-impact actionable signal; truthful metric over a fakeable one; liquidations scoped out honestly; teaching designed *into* the UI.
- **Engineering:** fan-out architecture decoupling upstream load from user count; correct frontend/backend split across Vercel + droplet by workload type; right-sized persistence (SQLite); and security-aware deployment that protects an existing production property on the same box.

---

## 11. Infra facts of record (discovered during inventory)

> Specific IPs, ports, and the full service inventory are kept out of this public doc. Operators have them locally.

- The droplet already hosts an existing production blog and its supporting services behind nginx (ports 80/443). The dashboard backend must coexist without disturbing them (see §8.5).
- **niminal.xyz** is NOT on the droplet — it's a **Next.js app on Vercel**, with DNS managed at the registrar. The dashboard frontend replaces it.
- The backend will be exposed only as `api.niminal.xyz` via a new, isolated nginx server block.

---

## 12. Progress log (Claude Code: keep updated)

> Legend: ✅ done · 🟡 in progress · 🔴 blocked · ⬜ not started · ↪️ pivoted (explain)
> For each task, update status and add a dated note for hurdles, decisions, deviations.

### Phase 1 — Backend core
- ✅ Poll Hyperliquid `metaAndAssetCtxs` (~2s)
- ✅ In-memory market-state cache
- ✅ Derive annualized funding + crowd-skew badge
- ✅ SSE endpoint (bound 127.0.0.1)
- *Notes:*
  - *2026-06-23 — Phase 1 complete. `backend/` is a zero-runtime-dependency Node 20 service: `hlClient` (single read-only POST to `metaAndAssetCtxs`, fixed body, 10s timeout — the only upstream touchpoint), `derive` (pure transform → board model), `cache` (in-memory source of truth, emits `update`), `poller` (single self-scheduling timer, exponential backoff capped at 60s), `sse` (full-snapshot fan-out, client cap → 503, 15s heartbeat), `server` (localhost-only, GET-only, `/stream` + `/health`, CORS locked to `https://niminal.xyz`, generic errors). Verified live: 178 active perps (delisted filtered from 230 in `universe`), derived funding/skew/OI-notional correct in the SSE payload; `/health` reports stale→ready; 405/404 routing correct; graceful SIGINT/SIGTERM shutdown. 7 unit tests for derivation pass via `node --test`.*
  - *Field shape confirmed against live API: top-level `[meta, ctxs]`, `meta.universe[i]` parallel-indexed with `ctxs[i]`; all numeric ctx fields are strings (parsed with a finite-number guard). Delisted markets carry `isDelisted` on the universe entry and are skipped.*
  - *Seeded a few §8.5/Phase-7 guards early because they were cheap and structural (poll backoff, SSE client cap + 503, heartbeat, localhost bind, GET-only, CORS lock, no stack traces, bounded HTTP timeouts). Full hardening + OS-level isolation still belongs to Phase 8.*
  - *Crowd-skew thresholds in `derive.js` (balanced <5%, extreme ≥50% annualized) are **provisional placeholders**, clearly marked — open question below stays open pending live-distribution inspection.*
  - *OI trend arrow returns `null` for now (needs stored snapshots — Phase 2).*

### Phase 2 — Persistence
- ⬜ SQLite (`better-sqlite3`), own dir, unprivileged user
- ⬜ Rolling OI snapshots (30–60s) + prune >1h
- ⬜ OI-trend derivation
- *Notes:*

### Phase 3 — Frontend board
- ⬜ Sortable per-perp table
- ⬜ Headline strip (funding × OI weighted)
- ⬜ Color coding by funding extremity
- *Notes:*

### Phase 4 — OI trend UI
- ⬜ Rising/unwinding arrows
- ⬜ "Warming up" state after restart
- *Notes:*

### Phase 5 — Signature feature
- ⬜ `predictedFundings` cross-venue panel
- ⬜ `fundingHistory` sparklines (cached)
- *Notes:*

### Phase 6 — Education layer
- ⬜ Term tooltips
- ⬜ Skew-badge plain-language copy
- ⬜ "How to read this board" expandable
- ⬜ Headline microcopy
- ⬜ Tone review: descriptive-only, no advice
- *Notes:*

### Phase 7 — Polish
- ⬜ OI-cap flags
- ⬜ Reconnect-with-backoff + REST fallback
- ⬜ Stale-data labeling
- *Notes:*

### Phase 8 — Security hardening (§8.5)
- ⬜ Node bound to 127.0.0.1 only; nginx sole public door
- ⬜ Dedicated unprivileged service user; no access to blog/DB dirs
- ⬜ systemd resource caps (MemoryMax/CPUQuota/TasksMax) so blog can't be starved
- ⬜ nginx limit_conn + limit_req per IP; client_max_body_size small; read timeouts
- ⬜ App-level max concurrent SSE/WS cap → 503 beyond
- ⬜ CORS locked to https://niminal.xyz, GET only
- ⬜ No pass-through to Hyperliquid; coin params validated vs universe allow-list
- ⬜ server_tokens off; no stack traces; health/SQLite not public
- ⬜ Firewall: 80/443/22 only; Node port not public
- *Notes:*

### Phase 9 — Deploy / cutover (§8)
- ⬜ Back up existing niminal Vercel app (Git + snapshot)
- ⬜ Repoint niminal Vercel project to dashboard; redeploy; verify HTTPS
- ⬜ BigRock DNS: A record api.niminal.xyz → <DROPLET_IP>
- ⬜ NEW nginx server block for api.niminal.xyz only (don't touch blog blocks)
- ⬜ SSE-friendly nginx (proxy_buffering off, long read timeout)
- ⬜ certbot TLS for api.niminal.xyz (separate; don't touch blog certs)
- ⬜ pm2/systemd service up
- ⬜ End-to-end stream verified from Vercel frontend
- ⬜ Blog health re-checked (aigraduate.com unaffected)
- *Notes:*
  - *Dependencies: install project-local only — `npm ci` (uses the committed `package-lock.json`) inside `backend/` under the service user's own directory. Never `npm install -g` / system-wide (§8.5 isolation). `better-sqlite3@^11` is prebuilt, so **no compiler toolchain** (build-essential/python) needs to be installed on the droplet.*

### Open questions
- ⬜ Poll-first vs WS-first upstream? (Recommend REST poll first.)
- ⬜ Skew-badge thresholds (inspect live funding distribution).
- ⬜ Headline weighting funding vs funding × OI? (Recommend × OI.)
- ⬜ api.niminal.xyz behind Cloudflare or direct? (Direct A record to start; buffering proxies can break SSE.)
- ⬜ Identify what owns the two Postgres clusters before deploy (avoid surprises).

### Decision / pivot log (append-only)
- *2026-06-19 — v0.2: added SQLite persistence, education layer, progress log.*
- *2026-06-19 — v0.3: inventory revealed droplet hosts aigraduate.com (Ghost), not niminal; niminal is a Vercel/Next.js app (DNS at BigRock). Pivoted to split architecture — frontend on Vercel (niminal.xyz), persistent backend on droplet (api.niminal.xyz). Added §8.5 security/attack-surface hardening focused on not harming the co-hosted blog and never becoming an open proxy to Hyperliquid.*
- *2026-06-23 — Phase 1 decisions:*
  - ***Zero runtime dependencies for the backend.*** *Node 20 built-ins only — global `fetch` (no axios/node-fetch), `node:http` + raw SSE (no Express). Rejected: web frameworks/HTTP clients. Why: smallest possible footprint on the $6 box co-hosting the blog, fewer supply-chain/CVE surfaces, nothing to audit. `better-sqlite3` (Phase 2) and a WS client (later WS swap) will be the first deps, added only when needed.*
  - ***~2s upstream poll cadence, env-configurable with a 1s hard floor.*** *A single poller serves all clients (fan-out), so upstream footprint is constant regardless of browser count. The floor makes an abusive low value impossible. The exact Hyperliquid rate-limit budget is treated as approximate; 2s is far under any plausible limit and the margin is the point — no logic is hard-coded around a specific budget number.*
  - ***Full-snapshot SSE payload (deltas deferred).*** *Each tick pushes the complete derived board + headlines. At ~tens of KB for ~200 perps every 2s, deltas buy almost nothing while adding state-tracking/resync complexity; full snapshots are also naturally robust to reconnects. Deltas remain a documented future lever only if concurrent-client bandwidth ever becomes the bottleneck.*
- *2026-06-24 — Phase 2 decisions:*
  - ***OI persistence is off the hot path.*** *SQLite is written/read only by the snapshotter (~every 60s); the 2s poll computes the OI-trend arrow against an in-memory reference `Map<coin,{oiNotional,ts}>` (the ~window-ago value), refreshed when each snapshot rolls. A ~60s-stale reference is negligible against a 15–30 min trend window. Rejected: per-coin SQLite queries on every poll (~178 × 30/min — wasteful on 1 vCPU).*
  - ***Pinned `better-sqlite3@^11.10.0` over latest v12.*** *Trigger: `npm install better-sqlite3` (v12.11.1) failed here — no prebuilt binary for Node 20.9.0/arm64, and the source fallback died on Python 3.13's removed `distutils` (old bundled node-gyp@9.4.0). v11.10.0 installs from a prebuilt binary (verified: loads + runs queries), so **no compiler toolchain is needed locally or on the droplet** — lower footprint and attack surface on the box that co-hosts the blog (§8.5 / CLAUDE.md #1), and v11 is sufficient for our single-writer use. Do NOT naively bump to v12 without solving the prebuild/toolchain story first. `package-lock.json` is committed so the droplet installs the exact same version.*
  - ***Dependency isolation.*** *All backend deps are project-local in `backend/node_modules`, installed under the service user's own directory — never system-wide, no global installs (§8.5 blast-radius isolation). The SQLite file likewise lives in its own dir (`OI_DB_PATH`, default `./data/`).*
