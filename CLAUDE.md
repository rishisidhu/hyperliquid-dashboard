# CLAUDE.md — Standing instructions for this project

These are persistent working instructions for **every** Claude Code session in this repo. Read them at the start of each session and follow them throughout. They complement `SPEC.md` (the product/technical spec) — read that too; §9 is the build phases and §12 is the living progress log.

## Working principles

1. **Write optimized code.** Favour efficient, clean implementations — mindful of the constrained target (a $6 shared-CPU droplet co-hosting a live blog). Avoid needless dependencies, busy loops, and wasteful allocations. Event-driven over polling-in-tight-loops where it matters.

2. **Security is always top of mind.** Treat §8.5 of `SPEC.md` (attack-surface hardening) as non-negotiable. The backend is read-only, localhost-bound, behind nginx, with strict CORS, resource caps, and no pass-through to Hyperliquid. The overriding rule: nothing this project does may ever risk the co-hosted blog (aigraduate.com) or get our IP rate-limited/banned by Hyperliquid. When in doubt, choose the safer option and flag it.

3. **Record optimization decisions.** Whenever a non-obvious performance/efficiency tradeoff is made, note it — what was chosen, what was rejected, and why — in the decision log in `SPEC.md` §12 (append-only). This is for future reference so we don't relitigate settled choices.

4. **Record the build journey.** Keep `SPEC.md` §12 updated as the source of truth for *what was built and why* and *where we are on the roadmap*. Update task statuses (✅/🟡/🔴/⬜/↪️) and add dated notes for hurdles, decisions, and deviations as you go — not in a batch at the end.

5. **Commit often.** Small, logical, frequent commits with clear messages. Commit at natural checkpoints (a working sub-feature, a passing test, a completed §12 task) rather than in large infrequent dumps.

6. **No Claude/AI attribution.** Do **not** add any Claude- or AI-related attribution anywhere — not in commit messages, not in code comments, not in docs. No "Generated with Claude Code", no "Co-Authored-By: Claude" trailer, no AI mentions. Disable the default Claude Code commit trailer. Commits and code should read as the author's own work.

7. **These instructions persist.** This file is the durable home for these rules. Keep it current; if we agree new standing rules, add them here so future sessions inherit them.

## Build discipline (from SPEC.md)

- Work the phases in `SPEC.md` §9 **in order, one at a time**. After each phase, stop, summarise, and wait for the user's go-ahead before the next.
- **Never** run anything that touches the droplet, DNS, Vercel, or deploys (Phases 8–9) without explicitly asking first and showing the exact commands. The droplet hosts a live blog — see §8.5.
- Ask before installing global tooling or making structural decisions the spec doesn't already settle.

## Repo structure

```
backend/    Node poller + SSE fan-out  → deploys to droplet (api.niminal.xyz)
frontend/   Next.js dashboard UI       → deploys to Vercel (niminal.xyz)
SPEC.md     product + technical spec (read fully)
CLAUDE.md   this file
```
