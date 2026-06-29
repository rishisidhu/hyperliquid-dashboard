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
6. **TLS:** issue a cert for `api.niminal.xyz` via the box's existing **acme.sh** (separate webroot `/var/www/certbot` + `--install-cert` to its own dir; don't touch blog cert/webroot/renewal). *(Box uses acme.sh, not certbot — confirmed Phase 9.)*
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
6. Education layer — **real tooltips on every term** (funding, premium, OI, crowd skew, annualized, OI-trend); the **"How to read this board"** control opens an **actual panel** (Phase 3 ships it as a non-functional stub); skew-badge copy, headline microcopy; descriptive-only, no buy/sell.
7. Polish — OI-cap flags, reconnect/backoff, stale labeling, **+ board density/UX** (focused Top-N default that never hides large markets — see §12 board-density spec).
7.5 **Theming (light mode)** — light-palette counterpart for the existing CSS-variable tokens under a theme selector (`data-theme` / `prefers-color-scheme`); session-persisted toggle; re-tuned OKLCH lightness for the skew ramp so teal/amber stay legible + colorblind-safe on light. After polish, before deploy.
7.6 **Live depth & discoverability** — make the page feel alive and surface the differentiator: light-mode header-bug fix + token-leak cleanup (completes 7.5); row-expand affordance; live "heartbeat" chart (top-5-by-OI signed funding, animated per snapshot); OI/price quadrant regime scatter (animated drift). Frontend-only, reuses the existing stream (no new endpoint). **Inserted before hardening/deploy on purpose** — see §12.
8. **Security hardening** — implement all §8.5 controls; verify Node is localhost-only, CORS locked, resource caps active, no info leakage. *(stays LAST-but-one — runs against the final feature set.)*
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
  - *2026-06-25 — Informal soak evidence (to cite at deploy): the backend ran continuously for several days during development with no crash, no memory growth/leak, and no Hyperliquid rate-limiting — consistent with the constant single-poller upstream footprint. Not a formal load test, but reassuring for the $6 shared box.*

### Phase 2 — Persistence
- ✅ SQLite (`better-sqlite3`), own dir, unprivileged user
- ✅ Rolling OI snapshots (30–60s) + prune >1h
- ✅ OI-trend derivation
- *Notes:*
  - *2026-06-24 — Phase 2 complete. `oiStore.js` (better-sqlite3 v11, WAL + synchronous=NORMAL, own-dir file via `OI_DB_PATH`, atomic record-then-prune, per-coin reference query using SQLite's bare-column-with-MAX idiom — commented so it isn't "fixed" later), `trend.js` (pure rising/unwinding/flat + 'warming' state, deadband), `snapshotter.js` (records one OI sample/coin every ~60s, prunes >1h, maintains an in-memory reference map refreshed each snapshot). Poller enriches `row.oiTrend` from that map every poll — **no SQLite on the 2s hot path**. Reference is primed from persisted history on startup, so trends survive restarts.*
  - *Configurable constants (env, defaults): `OI_SNAPSHOT_INTERVAL_MS`=60000, `OI_RETENTION_MS`=3600000 (~1h), `OI_TREND_WINDOW_MS`=1200000 (~20min, the now-vs-15–30-min-ago window), `OI_TREND_DEADBAND_PCT`=1.0, `OI_DB_PATH`=./data/oi.sqlite.*
  - *Verified live (with compressed interval/window): all coins `warming` at start → `{state:'ok', direction:'rising'|'unwinding'|'flat', pctChange, refAgeMs}` once a >window-old sample exists; SQLite file created in its own dir; prune transaction bounds the file. Full suite 18 tests pass (`node --test`): 7 derive, 6 trend, 5 oiStore (incl. bare-column idiom + prune).*
  - *Dependency: pinned `better-sqlite3@^11.10.0` (prebuilt, no toolchain) — see the v11-vs-v12 entry in the decision log below. Deferred: arrows/"warming" UI is Phase 4; file ownership/permission hardening is Phase 8.*

### Phase 3 — Frontend board
- ✅ Sortable per-perp table
- ✅ Headline strip (see note re: weighting)
- ✅ Color coding by funding extremity
- *Notes:*
  - *2026-06-24 — Phase 3 complete. `frontend/` scaffolded with create-next-app: Next 16.2.9, React 19, App Router, TypeScript, src/ layout, ESLint, import alias `@/*`, **no Tailwind** (plain CSS suits the token-driven design). No runtime deps beyond next/react. Fonts: Geist + JetBrains Mono via `next/font/google` (self-hosted). `output:'export'` set (SPEC §6 static export) — verified `next build` produces static `out/`.*
  - *Design ported from `design/` (mockup is Claude-Design templating, not React — re-implemented, not imported): tokens copied verbatim into `globals.css`; `skewColor`/`pipCount`/`pips`, the `usd`/`pct`/`price` formatters, and the `rowVM`/`trendVM`/`interp`/`hlItem` view model ported near-verbatim into `src/lib/` (null-safe, since the live feed can carry nulls the fixtures didn't). Components: `TopBar`, `HeadlineStrip`, `Board` (sortable), shared `Pips`. Live data via `useStream` (EventSource → /stream, auto-reconnect, board-level staleness, "updated Ns ago").*
  - *All five states implemented from real data: balanced (neutral axis tick), mild/extreme (pip ramp + OKLCH hue), warming (pulsing dot + "Warming up", no fake zeros), stale (row dim 50% + STALE chip). Long=teal / short=amber, never red/green; 24h column monochrome with ▲/▽ carets. Tone descriptive-only (interp copy, no buy/sell).*
  - *Verified end-to-end against the live Phase-1/2 backend (headless-Chrome screenshot): headline strip + sortable board render with real funding/skew/OI; warming state correct on a fresh DB. Build is green (TypeScript + lint + static export).*
  - *Deferred: education tooltips → light "How to read" control + header titles now, full in **Phase 6**; cross-venue panel + sparklines → **Phase 5** (no row-expand yet); mockup's design-system reference appendix → not built (its states are implemented live in the board). Search box wired as a client-side coin filter.*
- *Decision — headline ranking:* *Frontend ranks the strip by `skew.intensity` desc (excl. balanced), matching the locked design, rather than the backend's funding×OI `headlines` field (which goes unused for now). Reconciling the two remains the SPEC §12 open question ("Headline weighting funding vs funding × OI") — deferred. This is why the Phase-3 task above is annotated "see note re: weighting".*

### Phase 4 — OI trend UI
- ✅ Rising/unwinding arrows
- ✅ "Warming up" state after restart
- *Notes:*
  - *2026-06-24 — Verified, not net-new. The arrows + warming state were already built in Phase 3 (the locked design required every state to render), so Phase 4 was a verification pass focused on the one path never seen before: real `rising`/`unwinding`/`flat` arrows from genuine aged OI history (fresh DBs only ever produce `warming`).*
  - ***How the aged-history path was tested (compressed time):*** *Ran the backend with a short trend window + fast snapshots via env (test-only, not committed): `OI_TREND_WINDOW_MS=60000 OI_SNAPSHOT_INTERVAL_MS=5000 OI_RETENTION_MS=600000 OI_TREND_DEADBAND_PCT=0.05`, fresh `OI_DB_PATH`. So real OI samples accumulate and references (latest sample at/before now−window) populate within ~1 min from genuine data, not fixtures.*
  - ***Results:*** *At startup all 178 coins `warming` (no history ≥ window old). After the window elapsed, the warming→populated transition occurred and all three directions rendered from real data — a representative frame: `{warming:0, rising:43, unwinding:77, flat:58}`, with `refAgeMs`≈62s (correct for a 60s window at 5s granularity). Direction/sign consistent with the design's `trendVM` (▲ Rising / --rising, ▼ Unwinding / --unwinding, — Flat / --flat, signed pct).*
  - ***Deadband validated against real values:*** *across all 178 rows, zero violations — no row with |Δ|<0.05% was non-flat, and no row with |Δ|≥0.05% was flat (e.g. ATOM −0.04% → flat; BNB −0.07% → unwinding). Confirms small genuine changes correctly read as "flat".*
  - ***Production window unchanged:*** *the short window is test-only and was NOT committed; defaults remain `OI_TREND_WINDOW_MS=1200000` (~20min), `OI_SNAPSHOT_INTERVAL_MS=60000`. Verified `git status` clean after the test.*
  - *Visual confirmation of glyph/color/word/pct deferred to the operator's own browser (headless-Chrome screenshot was unreliable here — no `timeout` binary on macOS, and a running user Chrome locked the default profile). The frontend renders these states via the unit-covered `trendVM`; Phase 3 already screenshotted the same component in its warming state.*

### Phase 5 — Signature feature
- ✅ `predictedFundings` cross-venue panel
- ✅ `fundingHistory` sparklines (cached)
- *Notes:*
  - *2026-06-25 — Phase 5 complete. Backend: `predictedPoller` (slow ~60s, fixed body — no user input) → `derivePredicted` annualizes each venue by its own interval (HL 1h vs Binance/Bybit 8h: `rate × 24/intervalHours × 365 × 100`) so HL/Binance/Bybit are comparable → fanned out on a **separate named `predicted` SSE event** (emitted on refresh + on connect), keeping the 2s board frame lean. `GET /funding-history?coin=` serves annualized hourly points from a per-coin ~5min cache with in-flight dedupe. Frontend: row-expand reveals a cross-venue panel + an inline SVG sparkline (zero deps); cross-venue map consumed from the `predicted` event, history fetched on expand (client cache). Zero new deps either side.*
  - ***§8.5 — the one user-input path.*** *`predictedFundings`/`metaAndAssetCtxs` use fixed bodies (no SSRF surface). `/funding-history` is the sole endpoint taking user input: the `coin` is validated against the live universe allow-list (`cache.isKnownCoin`) plus a cheap pattern guard, and **never forwarded raw** — unknown/malformed → 400. Verified live: BTC → 200 (168 points); `NOTACOIN` and `%2e%2e%2fetc` → 400. Per-coin cache + dedupe preserve the fan-out principle (a popular coin = ~one upstream fetch per window).*
  - ***Optimization (as planned): separate `predicted` SSE event, not in the 2s frame.*** *The cross-venue map (~230 coins × venues, ~57KB) is only needed on row-expand and only changes ~60s, so it rides a named event emitted on refresh + once on connect — vs bloating every 2s board frame. Board `message` stays lean.*
  - ***Correctness — per-venue interval annualization*** *(tested): venues quote over different intervals, so raw rates aren't comparable; annualizing each by its own interval is what makes "HL vs Binance vs Bybit" valid. Verified live (BTC): Hyperliquid 10.95%/1h, Binance 3.11%/8h, Bybit −3.51%/8h. 28 backend tests pass (incl. interval annualization + cache/dedupe/TTL).*
  - ***Descriptive-only held firmly*** *(per standing instruction): the cross-venue panel shows per-venue funding numbers + next-funding times only — no copy implying an action (no "cheaper to hold on X"). The user draws their own conclusion.*
  - *Visual confirmation of the expanded panel deferred to the operator's browser — the headless-Chrome screenshot hangs here because the page's open EventSource keeps `--virtual-time-budget` from settling (and Node 20.9 has no global `WebSocket` for a CDP driver). Build is green (TypeScript validates the full render tree); backend data path verified live; SSR shell renders without error. To see it: expand any row in the running app.*

### Phase 6 — Education layer
- ✅ Real tooltips on **every** term: funding, premium, OI, crowd skew, annualized, OI-trend (+ 24h, 24h vol, cross-venue, funding interval)
- ✅ Skew-badge plain-language copy (badge already teaches; tooltip layers on top)
- ✅ "How to read this board" control opens an **actual panel** (was a non-functional stub in Phase 3)
- ✅ Headline microcopy (the rank-1 superlative / magnitude copy from the 2026-06-25 fix; interpretation lines under headline cards)
- ✅ Tone review: descriptive-only, no advice
- *Notes:*
  - *2026-06-24 — Scope locked: tooltips must cover every term listed above; the "How to read this board" button is intentionally a **non-functional stub in Phase 3** and tooltips are intentionally **absent** in Phase 3 — both are expected and resolved here in Phase 6. Copy stays descriptive, never prescriptive (no buy/sell).*
  - *2026-06-28 — Phase 6 complete. The Phase-3 stub button and absent tooltips are now **resolved**: the header control opens a real modal panel, and every term carries a tooltip.*
  - ***Mechanism:*** *`lib/glossary.ts` is the single source of all education copy (tooltips + panel both read it). `components/InfoTip.tsx` is a zero-dep accessible tooltip — a real `<button>` trigger reachable by **hover, focus (keyboard), and click (touch)**, with **Escape** and outside-pointerdown to close, `aria-describedby`/`role=tooltip` wiring, and `aria-expanded`. On sortable column headers it takes `stopPropagation` so the "i" affordance doesn't trigger a sort. Styled entirely from existing tokens (`--surface-3`, `--border-strong`, etc.).*
  - ***Tooltips wired:*** *board headers (Crowd skew, Funding ann., Open int., 24h, 24h vol, OI trend) and the cross-venue panel (cross-venue, funding interval/next, annualized). Each entry = one plain sentence: definition + what it means for a trade.*
  - ***Panel:*** *`HowToReadPanel.tsx` — modal `role=dialog`/`aria-modal`, backdrop + Escape close, focus moved to the close button on open. Sections: what the board shows · funding = crowd positioning · crowd skew & intensity · "What crowding does and doesn't tell you" · OI trend · cross-venue comparison · a "not financial advice" footer.*
  - ***Tone:*** *held descriptive-only throughout. Per review, section 4 was reframed from "crowded ≠ doomed" (which implies a stance about holding) to **"What crowding does and doesn't tell you"** — describes the signal (concentration; stretched positioning can unwind sharply; no direction/timing), counsels nothing. No buy/sell anywhere.*
  - ***Verification:*** *zero new deps; `next build` green (TypeScript validates the full render tree incl. panel + tooltips); panel + footer confirmed in SSR output. Visual confirmation of the open panel / live tooltips deferred to the operator's browser — headless-Chrome `--screenshot` hangs because the page's open EventSource keeps `--virtual-time-budget` from settling (same as Phases 4–5).*

### Phase 7 — Polish
- ✅ OI-cap flags
- ✅ Reconnect-with-backoff + REST fallback
- ✅ Stale-data labeling
- ✅ **Board density/UX** — focused Top-N default that never hides large markets
  - ✅ Default **Top 25** via a guarantee blend (top-OI always included, rest filled by intensity, deduped) — a high-OI balanced market (ETH) is never dropped
  - ✅ Top-N selector: **10 / 25 / 50 / All**; "All" always available
  - ✅ "Hide balanced" **opt-in** toggle (OFF default) with a min-OI floor — only the small/illiquid/balanced tail is hidden; big balanced markets stay
  - ⬜ List virtualization — **deferred, conditional** (trigger logged below; not needed yet)
- *Notes:*
  - *2026-06-28 — Phase 7 complete (5 commits: backend floors/OI-cap/`/board`; FE density; FE OI-cap badge; FE reconnect/stale; §12).*
  - ***Two OI floors (decision: "credibility of the hero vs completeness of the board").*** *Board SIGNIFICANCE floor `OI_FLOOR_USD=$1M` answers "is this a real market?" — emitted in the payload as `board.oiFloorUsd` and read by the frontend's hide-balanced filter (one shared constant). HEADLINE floor `HEADLINE_OI_FLOOR_USD=$10M` is higher so the marquee cards showcase liquid, credible crowding (ADA/TRUMP-class) rather than $2–4M froth. Pure-extremity ranking kept within the eligible set so the rank-1 "most one-sided book" superlative stays literally true (we deliberately did NOT blend size in — option C, rejected). A frothy small-cap like IP (+449%, ~$4.5M) still appears on the board and in its own row — just not as a headline hero unless it clears $10M. Graceful degradation: on a quiet day nothing clears $10M → that side shows no hero, and the superlative is intensity-gated so a mild leader is never called "most one-sided."*
  - ***Density ranking = guarantee blend (relevance ≠ skew).*** *`lib/density.mjs` `selectTopN`: always include the top `ceil(N×0.4)` markets by OI, then fill remaining slots by crowd intensity desc, dedup. Explainable per row ("here because it's one of the biggest" OR "one of the most crowded") — chosen over an opaque additive score. Verified live: ETH (balanced, $1.1B) stays in Top-25; search escapes the limit (typing a coin searches all ~230).*
  - ***Curated view is "real markets only" (≥$1M) — refinement 2026-06-28.*** *The $1M significance floor is now applied to the curated Top-N candidate pool — BOTH halves of the blend (top-OI guarantee and intensity-fill) — so the default board never pulls a sub-$1M micro-cap in via the "most crowded" path. The floor thus consistently means "is this a real market?" for the curated view. Two paths deliberately bypass it: **"All"** shows everything incl. sub-$1M (complete-market credibility), and **search** bypasses `selectTopN` entirely so any coin is findable. Net effect: IP (+423%, $4.4M) stays in the default (clears the floor); genuinely sub-$1M extremes (ZORA $538K, SNX $634K) leave the default view but remain reachable via All/search.*
  - ***Default sort = crowd-intensity DESC (2026-06-28).*** *Confirmed the board's default sort leads with the most crowded markets, matching the thesis "where is the crowd" (not biggest-first). Verified it was **already** intensity-desc since the Board's creation (never OI-desc); documented it with a comment so the deliberate default doesn't drift. All columns remain click-to-sort. Live evidence: rendered Top-25 led with S (intensity 0.791, −250%), IP (0.761, +215%), TRUMP (0.577, −87%), while BTC ($2.03B OI, intensity 0) sat at the bottom — so a market curated in for being extremely crowded visibly appears near the top.*
  - ***$1M curated-floor verified against live data (not just unit tests).*** *Ran the real `selectTopN`+sort pipeline on a live snapshot: curated Top-25 lowest-OI entries were S $1.02M, POPCAT $1.24M, kSHIB $1.54M — **min $1.02M, all ≥$1M ✓**. **"All"** returned 176 markets with lowest-OI PEOPLE $0.06M (sub-$1M present ✓). **Search** for ZORA ($0.60M, −105%) — absent from curated, found by search ✓. The floor holds exactly where intended and only there.*
  - ***OI-cap flag.*** *Slow ~45s fixed-body poller (`perpsAtOpenInterestCap`) stores the capped set; the 2s board poller stamps each row `atOiCap` (boolean — no payload bloat). FE shows a 🚫 AT CAP chip + InfoTip. **Live finding:** the entire current cap list (CANTO/FTM/JELLY/LOOM/RLB/ZEREBRO) is delisted coins absent from the active universe, so no badge shows right now — correct (a delisted market isn't tradeable). Stamping is unit-tested (capped ETH → `atOiCap:true`) and the live fetch+intersection verified.*
  - ***Reconnect + REST fallback.*** *`useStream` layers a REST fallback on EventSource's native reconnect: if the stream stays down past a 5s grace, poll `GET /board` every 5s so the board never freezes; resume the stream on recovery. New backend `GET /board` returns the current snapshot (reuses the cache).*
  - ***Stale labeling.*** *Top bar now has three states — live (connected+fresh, pulsing teal), stale (connected but `snapshot.stale` during an upstream blip, amber, "last updated Ns ago"), reconnecting (stream down). Per-row STALE chips/dimming from Phase 3 remain.*
  - ***Virtualization deferral — explicit trigger:*** *render all rows plainly. Add windowing ONLY if the "All" view (~230 rows @ 2s updates) visibly janks (dropped frames / input lag on scroll). Not observed; not implemented. (The default Top-25 means most sessions render ≤25 rows anyway.)*
  - ***Tests/deps:*** *`density.mjs` authored with JSDoc types (not `.ts`) so it unit-tests directly under `node --test` with **zero new deps** (the app imports it fully typed via `allowJs`+JSDoc). Backend 29 tests, frontend 5 density tests, all green; `next build` green. Visual confirmation of the new controls/badge deferred to the operator's browser (headless screenshot hangs on the open SSE stream, as in Phases 4–6).*

### Phase 7.5 — Theming (light mode) + dark contrast pass
- ✅ Dark contrast & depth re-tune (keep terminal identity; fix flat/depressing)
- ✅ Light-palette counterpart under `:root[data-theme="light"]` (dark = default)
- ✅ Theme toggle, persisted in localStorage; pre-paint script (no flash)
- ✅ Re-tuned OKLCH skew ramp for light (legible + colourblind-safe on white)
- *Notes:*
  - *2026-06-24 — Sequenced after Phase 7 polish, before Phase 9 deploy. Cheap because the frontend already references CSS-variable tokens (not hardcoded colors), so a second palette is mostly a token-set swap — the only real work is re-tuning the OKLCH skew ramp for light backgrounds.*
  - *2026-06-29 — Two separate commits: dark contrast pass, then light mode.*
  - ***Dark contrast & depth pass (token deltas).*** *Panels were melting into the bg. Bigger elevation steps + faint cool slate tint + stronger borders + brighter mid text. Accent discipline kept (teal/amber reserved for data; no brand accent in the chrome). Headline cards got a restrained accent-edge glow. Before → after:*
    - *`--bg` `#08090b` → `#0a0c12` · `--surface-1` `#0d0f13` → `#12151e` · `--surface-2` `#13161c` → `#1a1f2b` · `--surface-3` `#1a1e25` → `#232a38`*
    - *`--border` `#1e222a` → `#2a3140` · `--border-strong` `#2b313b` → `#3a4456`*
    - *`--text-1` `#e9ecf1` → `#eceff4` · `--text-2` `#a6aebb` → `#b2bac7` · `--text-3` `#6b7480` → `#79818f` · `--text-4` `#454c56` → `#4c5462`*
    - *`--balanced` `#5a626d` → `#626b78` · `--pip-off` `#262b34` → `#2c3340` · `--flat` → `#79818f`. Meaning hues (long/short/rising/unwinding/stale) unchanged — re-checked, they still pop on the lifted surfaces.*
  - ***Light mode.*** *`:root[data-theme="light"]` overrides the same token names (white cards on a soft cool-grey page, near-black text, darkened meaning hues). Dark is the default with or without the attribute. `useTheme` persists to localStorage; a pre-paint inline script in `layout.tsx` sets `data-theme` before hydration (`suppressHydrationWarning` on `<html>`) so CSS tokens are correct on the first frame. Sun/moon toggle in the top bar. Default theme is DARK (not `prefers-color-scheme`) — terminal aesthetic is the brand; light is opt-in.*
  - ***Light skew ramp (re-tuned, theme-aware `skewColor`).*** *The continuous pip ramp can't live in CSS, so `skewColor` takes a `theme`: dark climbs lightness with intensity; light FALLS in lightness while chroma climbs (darker + more saturated = more extreme on white). Hues unchanged (teal 195 / amber 70). Sample mapping (intensity t via the log scale):*

    | ann% | t | long (light) | short (light) |
    |---|---|---|---|
    | 10% | 0.140 | `oklch(0.632 0.074 195)` | `oklch(0.672 0.084 70)` |
    | 30% | 0.363 | `oklch(0.587 0.096 195)` | `oklch(0.627 0.106 70)` |
    | 50% | 0.466 | `oklch(0.567 0.107 195)` | `oklch(0.607 0.117 70)` |
    | 100% | 0.606 | `oklch(0.539 0.121 195)` | `oklch(0.579 0.131 70)` |
    | 300% | 0.829 | `oklch(0.494 0.143 195)` | `oklch(0.534 0.153 70)` |
    | 700% | 1.000 | `oklch(0.460 0.160 195)` | `oklch(0.500 0.170 70)` |

  - ***Verification:*** *`next build` green; 29 backend + 7 FE tests pass. `theme` threaded through `rowVM`/`hlItem`; all `pips()`/`skewColor()` call sites updated. Visual confirmation of both themes deferred to the operator's browser (headless screenshot still hangs on the open SSE stream).*

### Phase 7.6 — Live depth & discoverability
- ✅ Light-mode header-bug fix + token-leak cleanup (completes 7.5)
- ✅ Row-expand affordance (chevron + hover cue)
- ✅ Live "heartbeat" chart (top-5-by-OI signed funding, animated per snapshot)
- ✅ OI/price quadrant regime scatter (animated drift; warming cold-start)
- *Notes:*
  - ***Sequencing rationale (2026-06-29).*** *Roadmap order changed: feature work (this phase) is inserted BEFORE Phase 8 (security hardening) and Phase 9 (deploy), which stay last. Reason: the §8.5 hardening audit and the cutover must run against the FINAL feature set — if we hardened/deployed first, later feature changes (new components, new client behaviour) would invalidate the audit and the deploy. Hardening + deploy always go last. (Phase 7.6 is frontend-only and adds NO server endpoint — it reuses the existing SSE stream — so it doesn't expand the eventual hardening surface.)*
  - ***Header bug + token leaks.*** *The sticky header used a hardcoded `rgba(8,9,11,.92)` (dark `--bg`), so in light mode it stayed dark-on-dark. Migrated to a themed `--header-bg` (a `color-mix` of `--bg` that auto-tracks the theme). Grep also found the modal scrim and two elevation box-shadows hardcoded — tokenized as `--scrim` and `--shadow-color` (per-theme). No hardcoded colours remain in components.*
  - ***Expand affordance.*** *Quiet leading chevron in the Market cell that rotates 90° when open (CSS transition), brightens on row hover, plus a native `title` ("Expand — cross-venue funding & history"). Reduced-motion now also neutralizes transitions.*
  - ***Heartbeat chart.*** *`useHeartbeat` keeps a rolling ~2min client-side window for every coin (fed by each 2s snapshot — no new endpoint) and exposes the current top-5 by OI. `Heartbeat` is an inline-SVG multi-line chart redrawn per snapshot (~30×/min). Continuous "alive" feel = a GPU-composited CSS-pulsing leading dot, NOT per-frame JS (no rAF, no charting lib). Warming state until ≥2 samples.*
  - ***Metric changed to live PREMIUM (2026-06-29) — funding was too flat.*** *Funding is hourly, so over a 2-min window it barely moves → the chart looked dead, defeating the "feels alive" goal. Switched to **live premium (mark vs oracle, %)**: it moves every tick AND is on-thesis — the real-time crowd-pressure signal that funding lags (pressure building/releasing live). Verified on a live 16s sample: HYPE swung −0.035%→+0.053%→−0.006% while all top-5 wiggled continuously. **Auto-scale (critical, premium is tiny):** fit the y-axis to the window's actual min/max + 12% padding, with a near-flat guard (open a ±0.001% band if range <0.002%). On that live sample, min −0.0764% / max +0.0533% → domain [−0.0919%, +0.0688%] fills the plot; a fixed ±0.5% axis would have used only ~13% of the height (why funding looked flat). **Fallback ready** if premium reads too noisy live: normalized mid-price % change since the window opened (each coin starts at 0) — a small swap in `useHeartbeat` + component.*
  - ***Heartbeat bug fixes (2026-06-29).*** *(a) Label collision (HYPE/BTC, SOL/ETH stacked): leading-edge labels are now de-collided (greedy top-down min-gap, then push the stack up on bottom overflow) and each shows the coin's **current value**. (b) Dots + labels moved to an HTML overlay so they stay round/crisp — under `preserveAspectRatio="none"` (which stretches X for the time-series lines) SVG circles/text would distort; y maps 1:1 to px since SVG height = viewBox H. Labels stay readable in both themes (side-coloured tokens).*
  - ***Regime scatter.*** *`Quadrant` plots significant markets (≥$1M, `oiTrend.state==='ok'`, ~40 cap) by 24h price change × OI-trend → four plain-language regimes (new longs / short squeeze / long unwind / new shorts), descriptive labels only (no advice). Dots drift each tick via a GPU-composited `transform` transition; **container-query units (`cqw`)** keep X responsive without `preserveAspectRatio` distorting the round dots. **Cold-start handled:** when no coin has OI history yet (fresh backend), shows "Warming up — building history…" rather than an empty plot, same principle as the OI-trend column; fills in as history accrues. Reuses existing row data.*
  - ***Layout.*** *Two-up "live band" (`Heartbeat | Quadrant`) between the headline strip and the board; stacks to one column ≤760px. Preserves the one-screen wedge: static story → live pulse → detailed board.*
  - ***Discipline/verification.*** *Tokens-only (no new hardcoded colours), colourblind-safe (teal/amber + position + labels), **zero new deps** (inline SVG + CSS), reduced-motion disables pulse/drift. Backend untouched; no new endpoint (hardening surface unchanged). `next build` green; 29 backend + 7 FE tests pass. Visual review in-browser by the operator (headless screenshot still hangs on the open SSE stream).*
  - ***Rebrand → "Niminal · Crowd" (2026-07-xx).*** *Product is now Niminal (brand) with Crowd as the product sub-name. Three changes: (1) header wordmark "Niminal · Crowd" — Niminal in `--text-1`, middot `--text-3`, Crowd `--text-2`, same mono/letter-spaced treatment, themed both modes; (2) tab title → "Niminal · Crowd — Hyperliquid perp positioning" + matching description (`layout.tsx` metadata); (3) favicon → `app/icon.svg`, a geometric single-stroke "N" on the brand dark square, replacing the default Vercel triangle (`favicon.ico` removed). SVG-only favicon (universally supported by current browsers; no raster fallback bundled, keeping zero-dep, and Next doesn't need one when `icon.svg` is present). Favicon colours are the brand token VALUES baked in as literals — a standalone icon can't read CSS tokens (documented exception to tokens-only). `next build` green; verified in `out/` (title, `/icon.svg` link, no `favicon.ico`).*
  - ***Portfolio footer (2026-07-xx).*** *Quiet footer below the board: "Built by Rishi Sidhu · © \<year\>" (dynamic year) + one-line project description, with Source (GitHub: rishisidhu/hyperliquid-dashboard) and LinkedIn links (`target=_blank rel=noopener noreferrer`). **Text-only** — `lucide-react` isn't a dep and the project holds zero-new-deps, so no icon library; also fits the understated brief. Muted text tokens (`--text-3/4`), themed for light+dark via a `.footer-link` hover rule, no tracking/external scripts. Renders in the static export (verified in `out/index.html`); always present (even in the loading state). `next build` green.*

### Phase 8 — Security hardening (§8.5)
- ✅ Node bound to 127.0.0.1 only; nginx sole public door *(verified live across ALL endpoints)*
- ✅ Dedicated unprivileged service user; no access to blog/DB dirs *(authored: systemd unit)*
- ✅ systemd resource caps (MemoryMax/CPUQuota/TasksMax) so blog can't be starved *(authored)*
- ✅ nginx limit_conn + limit_req per IP; client_max_body_size small; read timeouts *(authored)*
- ✅ App-level max concurrent SSE cap → 503 beyond *(in code — `MAX_SSE_CLIENTS`)*
- ✅ CORS locked to https://niminal.xyz, GET only *(in code; prod default unweakened)*
- ✅ No pass-through to Hyperliquid; coin params validated vs universe allow-list *(in code; re-verified)*
- ✅ server_tokens off; no stack traces; health/SQLite not public *(nginx `server_tokens off` + `/health` 404; code generic 500 + public-safe /health)*
- ⬜ Firewall: 80/443/22 only; Node port not public *(DO cloud firewall — applied in Phase 9; localhost bind already keeps the Node port unreachable)*
- *Notes:*
  - *2026-07-01 — Phase 8 complete (code hardened + deploy config authored; **nothing applied to the droplet** — that's Phase 9). The payoff of seeding §8.5 controls in earlier phases: most were already in place; Phase 8 was a small code delta + authoring deploy artifacts + verification.*
  - ***Code (applied now):*** *Top-level `try/catch` around the request handler → guaranteed generic `500 {error:"internal"}`, so no route can leak a stack. `/health` reduced to a public-safe shape (`healthy` boolean + counts; dropped raw `lastError`) per your ask — kept for local ops, and nginx 404s it so it's never public. Re-verified live with no regression across later phases: localhost-only bind on all endpoints (socket on `127.0.0.1:8080`, not `0.0.0.0`); GET-only (POST→405); `/funding-history` BTC→200, NOTACOIN/`%2e%2e%2f…`/empty→400. 29 backend tests pass.*
  - ***Deploy config (authored, NOT applied — `backend/deploy/`):*** *`hyperliquid-dashboard.service` (unprivileged `hldash` user, `MemoryHigh=128M`/`MemoryMax=160M`/`CPUQuota=35%`/`TasksMax=64`, `ProtectSystem=strict`+`PrivateTmp`+scoped `ReadWritePaths=/var/lib/hldash`, `HOST=127.0.0.1`, `CORS_ORIGIN=https://niminal.xyz`); `nginx/api.niminal.xyz.conf` (new isolated block — SSE proxy buffering off + 1h read timeout, TLS w/ separate cert, `limit_req`/`limit_conn`, `client_max_body_size 1k`, `server_tokens off`, `location = /health { return 404; }`, non-API → 404); `nginx/rate-limits.conf` (http-context zones for `conf.d/` so the blog's `nginx.conf` is never touched); `README.md` (cap rationale sized for the 1 GB/1 vCPU shared box, apply steps, §8.5 control→artifact map).*
  - ***§8.5 drift reconciliation (doc now matches reality):*** *(1) Client fan-out is **SSE only** — there is no WebSocket to browsers; the **upstream is still REST poll** (the WS-to-HL swap was deferred), so §8.5's "reconnect-with-backoff to HL WS" reads as N/A — the real control is the REST-poll backoff (present). (2) The endpoint set grew after §8.5 was written: `/board` (REST fallback — kept **public**) and `/funding-history` (the one **user-input** path — public + validated); `/health` is **not** public. (3) "coin params validated vs universe" is now **concrete** (`/funding-history`), not aspirational. (4) The Phase-7.6 client features (heartbeat/quadrant) add **no endpoint** — hardening surface unchanged.*
  - ***Line held:*** *Phase 8 produced hardened code + repo config only. The droplet, DNS, Vercel, and certs are untouched — Phase 9 applies everything.*

### Phase 9 — Deploy / cutover (§8)
- ⬜ Back up existing niminal Vercel app (Git + snapshot)
- ⬜ Repoint niminal Vercel project to dashboard; redeploy; verify HTTPS
- ⬜ BigRock DNS: A record api.niminal.xyz → <DROPLET_IP>
- ⬜ NEW nginx server block for api.niminal.xyz only (don't touch blog blocks)
- ⬜ SSE-friendly nginx (proxy_buffering off, long read timeout)
- ⬜ acme.sh TLS for api.niminal.xyz (separate webroot `/var/www/certbot` + `--install-cert`; don't touch blog cert/webroot/renewal)
- ⬜ pm2/systemd service up
- ⬜ End-to-end stream verified from Vercel frontend
- ⬜ Blog health re-checked (aigraduate.com unaffected)
- *Notes:*
  - *Dependencies: install project-local only — `npm ci` (uses the committed `package-lock.json`) inside `backend/` under the service user's own directory. Never `npm install -g` / system-wide (§8.5 isolation). `better-sqlite3@^11` is prebuilt, so **no compiler toolchain** (build-essential/python) needs to be installed on the droplet.*
  - *2026-07-01 — **Runbook authored: `backend/deploy/RUNBOOK.md`** (not executed). Precise, ordered, copy-pasteable steps drawn from `backend/deploy/`; each step has command · what it does · success check · rollback. Order is blog-safe and additive: pre-flight backups → backend up **privately** (user/code/`npm ci`/systemd, localhost-verified) → nginx rate-limit drop-in + HTTP-only api block → DNS A record → TLS → enable 443 → **verify backend over TLS AND blog health (explicit STOP-if-blog-affected gate)** → confirm DO firewall 80/443/22 → Vercel repoint (env var set before build) → final E2E + per-layer rollback. **Operator executes each command by hand with review; assistant runs nothing against droplet/DNS/Vercel.** Resolves the cert chicken-and-egg (HTTP-only block → DNS → webroot challenge → enable 443) and the NEXT_PUBLIC build-time-inlining gotcha.*
  - *2026-07-xx — **TLS revised to the box's actual tooling: acme.sh, not certbot.** Investigation found acme.sh (`/etc/letsencrypt/acme.sh`, home `/etc/letsencrypt`, daily cron `20 0 * * *`); blog cert via webroot HTTP-01 (`/var/www/ghost/system/nginx-root`). Revised `nginx/api.niminal.xyz.conf` cert paths to acme.sh's install location (`/etc/letsencrypt/api.niminal.xyz/{fullchain.cer,api.niminal.xyz.key}` — not certbot's `live/`), and RUNBOOK §4 to `acme.sh --issue --server letsencrypt -d api.niminal.xyz -w /var/www/certbot` (a **separate** webroot) + `--install-cert` with an nginx-reload `--reloadcmd` (so it joins the existing cron). Blog cert/webroot/renewal untouched. Other resolved box facts: nginx `sites-enabled/` + `conf.d/` both included; Node 20 at `/usr/bin/node`; `hldash` user + `/opt/hldash/backend` + `npm ci` present; port 8765 free.*

### Open questions
- ✅ **RESOLVED — Poll-first upstream.** Shipped as REST poll (`metaAndAssetCtxs` ~2s); the WS-to-HL swap stays a future optimization, not needed at current scale.
- ✅ **RESOLVED 2026-06-25 — Skew-badge thresholds → LOG intensity scale.** Replaced the linear `SKEW_BALANCED_MAX=5`/`SKEW_EXTREME_MIN=50` with a log map between `BALANCED_ANN_PCT=5` and `EXTREME_ANN_PCT=700` (clamped beyond HI). See the decision-log entry below for the mapping table and why log beats linear/percentile/piecewise on this distribution.
- ✅ **RESOLVED 2026-06-25 — Headline weighting → R1 (`|ann %|` + OI floor), backend-canonical.** Rank by `|annualized %|` desc among markets above `OI_FLOOR_USD` (default $1M), tiebreak OI desc then coin asc. Computed once in the backend (`deriveHeadlines`); the frontend consumes `board.headlines` instead of recomputing — resolving the backend-vs-frontend split too. (Rejected funding×OI: the card's hero number is funding %, so ranking by it keeps each card self-consistent and the superlative truthful.)
- ✅ **RESOLVED — Direct A record (no Cloudflare/CDN)** for api.niminal.xyz: a buffering proxy breaks SSE. Specified in the runbook DNS step; revisit only if abuse appears (and test SSE behind any proxy first).
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
- *2026-06-24 — Phase 3 decisions:*
  - ***Plain CSS + inline styles, no Tailwind.*** *The design is token-driven (CSS custom properties) with per-row OKLCH colors computed in JS (`skewColor(side,t)`). Tokens live as global CSS; dynamic per-row colors use inline style objects — mirroring the mockup exactly. Tailwind would fight the runtime OKLCH ramp and add tooling for no gain. Rejected: Tailwind, CSS-in-JS libs.*
  - ***Static export (`output:'export'`).*** *The dashboard is a client-rendered SPA that streams from `api.niminal.xyz`; it ships as static assets on Vercel (SPEC §6). No server runtime needed on the frontend. Verified `next build` emits `out/`.*
  - ***Frontend has zero deps beyond Next/React.*** *No chart lib yet (sparklines are Phase 5), no state lib (React state suffices). Keeps the bundle and supply-chain surface minimal.*
  - ***Dev cross-origin: real CORS, no proxy.*** *Local dev hits the backend directly via `NEXT_PUBLIC_STREAM_URL`; run the backend with `CORS_ORIGIN=http://localhost:3000`. Exercises the true cross-origin/SSE path rather than masking it behind a dev proxy. Documented in `frontend/.env.local.example`.*
  - ***Next 16 note:*** *create-next-app pulled Next 16 (breaking changes vs training data — flagged by its AGENTS.md). Verified `next/font/google` and `output:'export'` against the bundled docs before building. EBADENGINE warning (an ESLint transitive dep prefers Node ≥20.19; we're on 20.9) is non-blocking — build is green.*
- *2026-06-24 — Scope locks (no build this turn; recorded for future phases):*
  - ***Board principle: relevance ≠ skew.*** *The board must NOT hide a large market just because its funding is neutral. The focused Top-N default (Phase 7) ranks by a blend of crowd intensity AND market size (OI), and "Hide balanced" is opt-in with a minimum-OI floor — so a high-OI balanced market (e.g. SOL at neutral funding) always stays visible. "All" is always selectable to preserve complete-market credibility. The OI floor is a configurable constant.*
  - ***List virtualization deferred — explicit trigger.*** *Do NOT add virtualization preemptively. Implement it ONLY if the "All" view (~230 rows) does not scroll/update smoothly in practice. Until that trigger fires, plain rendering keeps the code simpler and avoids a dep.*
  - ***Light mode is cheap by construction.*** *Because the frontend references CSS-variable tokens (not hardcoded colors), a light theme is mostly a second token set behind a `data-theme`/`prefers-color-scheme` selector; the only substantive work is re-tuning the OKLCH skew-ramp lightness so teal/amber stay legible + colorblind-safe on light. Sequenced as Phase 7.5 (after polish, before deploy).*
- *2026-06-25 — Crowd-skew correctness fix (dedicated sub-task spanning backend + frontend; triggered by SUSHI showing −107% under the false "funding clamps at ±11%" premise, and kSHIB ranking above the more-extreme SUSHI in the shorts headline):*
  - ***Intensity → LOG scale (resolves skew-threshold open question).*** *Constants `BALANCED_ANN_PCT=5`, `EXTREME_ANN_PCT=700` (configurable); `intensity = clamp((log10(|ann%|) − log10(5)) / (log10(700) − log10(5)), 0, 1)`; `|ann%| < 5` → Balanced (axis tick). Mapping (value → intensity [pips]):*

    | value | linear (old) | **log (chosen)** | piecewise | percentile |
    |---|---|---|---|---|
    | 10% | 0.111 [1] | 0.140 **[1]** | 0.067 [1] | 0.400 [2] |
    | 30% | 0.556 [3] | 0.363 **[2]** | 0.333 [2] | 0.883 [5] |
    | 50% | **1.000 [5]** | 0.466 **[3]** | 0.600 [3] | 0.926 [5] |
    | 100% | **1.000 [5]** | 0.606 **[4]** | 0.631 [4] | 0.970 [5] |
    | 300% | **1.000 [5]** | 0.829 **[5]** | 0.754 [4] | 0.996 [5] |
    | 700% | **1.000 [5]** | 1.000 **[5]** | 1.000 [5] | 0.996 [5] |

    *Why log: the only scale that keeps the common 10–50% range AND the extreme tail distinct with **fixed anchors** (stable + comparable over time). Linear saturated everything ≥50% to 1.0 (the bug). Percentile saturates even worse here — 92 coins cluster at the ~11% baseline, so anything ≥30% is already >88th percentile → all 5 pips — and is unstable (a coin's colour shifts when others move). Piecewise compresses the tail (100% and 300% share 4 pips) with arbitrary breakpoints. Verified live: −10/30/50/100/300/700% → 1/2/3/4/5/5 pips.*
  - ***Headlines → R1, backend-canonical (resolves headline-weighting + backend/frontend reconciliation).*** *Rank by `|ann %|` desc above `OI_FLOOR_USD` (default $1M — a configurable constant shared with the Phase-7 board-density filter), tiebreak OI desc then coin asc. Floor sensitivity on a live pull: $0.5M still let illiquid 0G (−714% on $0.5M OI) lead; **$1M** drops the sub-$1M micro-market tail (0G, MERL, ME, SUSHI) and leads with the most-extreme liquid short. Frontend now consumes `board.headlines` (no client re-ranking). Verified: shorts lead with the genuinely most-extreme liquid market, strictly monotonic by |ann%|, kSHIB correctly demoted — no more kSHIB-above-SUSHI contradiction.*
  - ***Superlative gated to rank-1.*** *"…the most one-sided book on the board" fires only when `isTop` (rank-1) AND intensity ≥ 0.6 — never just because intensity ≥ a threshold (the old bug). So it can't contradict the numbers beside it, and won't over-claim on a mild top. Lower magnitudes get plain copy ("heavily crowded" / "notably crowded" / "mild lean") on the new log intensity. Descriptive-only; palette unchanged. Verified: rank-2 short at intensity 0.67 gets NO superlative; a mild top long (14% ) correctly reads "a mild lean".*
  - ***Data reality — Hyperliquid funding baseline (CORRECTED 2026-06-25).*** *~~Cap ≈ 0.0000125/hr → ±10.95% annualized.~~ **This earlier note was WRONG.** `0.0000125/hr` is the **interest-rate baseline**, NOT a clamp: coins whose premium ≈ 0 fall back to it (≈89 sit exactly there), and ~52 sit at exactly zero — but funding is **effectively unbounded** and routinely runs far past the baseline. On a live 230-coin pull, **46 coins exceed ±0.0000125/hr**, with the short tail reaching −106% (SUSHI), −167% (MERL), −214% (CHIP), down to **−714% (0G)**. Verified: raw `funding × 24 × 365 × 100` is correct (BTC sanity 1.31%); SUSHI's −107% is real data, not a derivation bug. Implication: any intensity/threshold scheme MUST handle a long thin tail to ±700%+, and a linear cut-off at ±50% saturates that whole tail — see the skew-threshold resolution (below).*
