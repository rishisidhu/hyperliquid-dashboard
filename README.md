# Niminal · Crowd

**Live: [niminal.xyz](https://niminal.xyz)**

A live dashboard that reads **crowd positioning** on Hyperliquid perpetuals. The
core idea: on a perp, the **funding rate is an honest, native proxy for how
crowded a trade is** — positive funding means longs are paying shorts to hold
(the crowd is leaning long and paying for it), negative means the reverse, and
the more extreme the rate, the more stretched and squeeze-vulnerable that
positioning. Niminal · Crowd surfaces that signal per market, in one screen,
with the cost-of-carry and a cross-venue comparison alongside it. It deliberately
uses the truthful signal rather than a fabricated "long/short trader count" (the
public API can't produce one without a wallet indexer), and it never tells you
what to trade — it describes what the numbers mean and leaves the call to you.

## Features

- **Crowd-skew board** — one sortable row per perp: mark price, 24h change,
  annualized funding, a crowd-skew badge, open interest, 24h volume, and an
  OI-trend arrow.
- **Log-scaled intensity** — skew intensity uses a logarithmic scale (funding is
  effectively unbounded; the live tail runs past −700%), so the common 10–50%
  range and the extreme tail stay visually distinct instead of saturating.
- **Headline cards** — "most crowded longs / shorts right now," ranked
  canonically on the backend by |annualized funding| above a liquidity floor, so
  the marquee markets are liquid and the "most one-sided book" copy can't
  contradict the numbers next to it.
- **Cross-venue funding comparison** (the signature feature) — expand any row to
  see Hyperliquid funding beside Binance and Bybit, each annualized to a common
  basis (venues use different funding intervals), plus next funding time.
- **Funding-history sparklines** — per-coin, on demand, showing whether the crowd
  is getting more or less stretched over time.
- **Live "Crowd pulse"** — a lightweight chart of the top markets' live premium
  (mark vs oracle) that updates on every snapshot, so the page has a heartbeat.
- **Regime-map scatter** — markets plotted by 24h price change × OI trend into
  four plain-language regimes (new longs / short squeeze / long unwind / new
  shorts), drifting as data updates.
- **OI-trend arrows** — rising vs unwinding open interest versus ~20 minutes ago,
  with an honest "warming up" state until history accumulates (never fake zeros).
- **Education layer** — plain-language tooltips on every term and a "How to read
  this board" panel; descriptive, never prescriptive.
- **Light / dark themes** and **density controls** (Top-N, hide-balanced) that
  never drop large markets just for being balanced.

## Architecture

```
        Hyperliquid public API
                 │  one poller, fixed schedule (NOT per user)
        ┌────────▼───────────────────────────┐
        │  DROPLET  api.niminal.xyz           │
        │  Node poller + SSE fan-out          │
        │  (127.0.0.1, behind nginx)          │
        │  in-memory cache · SQLite OI history │
        └────────┬───────────────────────────┘
                 │  https (SSE stream + small REST)
        ┌────────▼───────────────────────────┐
        │  VERCEL  niminal.xyz                │
        │  static Next.js export (global CDN) │
        └────────┬───────────────────────────┘
                 │
            N browsers
```

The frontend is a **static export on Vercel**; the backend is a **single
long-lived Node process on a DigitalOcean droplet**. They're split because a
persistent SSE/poller can't live on Vercel's serverless model — and because one
backend talking to Hyperliquid means **upstream load is constant no matter how
many people are watching** (every browser streams from us; we make one set of
calls). The backend keeps an in-memory cache as the source of truth and a small
**SQLite** file for rolling OI snapshots (so the trend arrows survive restarts).
The droplet also hosts an unrelated blog, so the service is hard-capped and
sandboxed to stay out of its way.

## Tech stack

- **Backend:** Node (zero runtime dependencies beyond `better-sqlite3`) — global
  `fetch` for polling, `node:http` + raw SSE for fan-out.
- **Frontend:** Next.js (App Router) static export, React, **plain CSS with OKLCH
  design tokens** (no CSS framework), Server-Sent Events for the live stream.
- **Persistence:** SQLite via `better-sqlite3` (rolling OI history).
- **Deploy:** DigitalOcean droplet · nginx (isolated server block) · systemd
  (unprivileged user + resource caps) · acme.sh for TLS. Frontend on Vercel.

## Design philosophy

- **Dense for the pro, legible for the novice** — a Bloomberg-terminal ethos:
  high information density, but with the education layer making every term
  readable to someone new to perps.
- **Descriptive, never prescriptive** — the dashboard explains what funding,
  skew, premium and OI trend *mean*; it never says buy/sell or what to do.
- **Colorblind-safe** — long = teal, short = amber, **never red/green**;
  direction is also carried by labels and filled segments, so meaning never
  depends on hue alone.

## Local development

Backend (poller + SSE on `127.0.0.1:8080`):
```bash
cd backend
npm install
npm start
```

Frontend (Next.js dev server; point it at the local backend):
```bash
cd frontend
npm install
NEXT_PUBLIC_STREAM_URL=http://127.0.0.1:8080/stream npm run dev
```
Open http://localhost:3000. Run `npm test` in `backend/` for the unit tests.

**Key env vars** (all optional; sensible defaults):

| Var | Where | Default | Purpose |
|---|---|---|---|
| `PORT` / `HOST` | backend | `8080` / `127.0.0.1` | bind address (localhost-only) |
| `POLL_INTERVAL_MS` | backend | `2000` | upstream poll cadence (floored to stay polite to the API) |
| `CORS_ORIGIN` | backend | `https://niminal.xyz` | allowed browser origin (set to `http://localhost:3000` in dev) |
| `OI_FLOOR_USD` | backend | `1000000` | "real market" significance floor |
| `OI_DB_PATH` | backend | `./data/oi.sqlite` | SQLite location for OI history |
| `NEXT_PUBLIC_STREAM_URL` | frontend | `http://127.0.0.1:8080/stream` | backend SSE endpoint (inlined at build time) |

## Scope — what it deliberately does not show

- **No liquidation feed.** Hyperliquid's public API only exposes liquidations
  inside per-user events, not as a market-wide stream — so it's out of scope
  rather than approximated.
- **No fabricated long/short trader counts.** Producing one would require
  indexing every wallet's positions; instead, funding is used as the honest,
  natively-available proxy for crowd positioning.
- Funding updates hourly, so only price and OI feel truly "live" — the live
  premium chart exists precisely because premium moves continuously while
  funding lags.

These are deliberate choices: surface the truthful signal, and be honest about
what the free public data can and can't say.
