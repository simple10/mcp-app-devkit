# PMC App Dev Kit

Build & prototype **MCP apps (tools + UI views) for Portkey Mission Control**, locally, then test them live in
Claude Desktop over ngrok. A skybridge fork with **real local Durable Object** storage (DO SQL) and a driver
**skill** so Claude can build apps end-to-end.

## Quick start
```bash
npm install
npm run dev          # skybridge dev — fast UI iteration (in-memory store). MCP at :3010/mcp, DevTools at :3010/
# or
npm run dev:do       # skybridge build && wrangler dev — REAL local DO (DO SQL, persisted). Use to test persistence
                     # + for the Claude Desktop connector.
```
Render views without an LLM at `http://localhost:3010/` (the DevTools). To use in Claude Desktop:
`ngrok http 3010` → add `https://<x>.ngrok-free.app/mcp` as a custom connector (Auth: None).

## The skill (how Claude builds apps)
`skill/` is the **`pmc-app-dev`** skill (forked from skybridge's `mcp-app-builder`). Install it in Claude Desktop;
it drives the whole loop: scaffold tools+views → run the dev server → ngrok → connect → iterate. Start at
`skill/SKILL.md`; app-authoring guidance is in `skill/references/`.

## Layout
```
src/server.ts     # MCP server — register tools (one view-bearing tool per view)
src/store.ts      # getStore() — DO SQL under wrangler, in-memory under skybridge dev (same app code)
src/task-do.ts    # the Durable Object (DO SQL) — the example app's table + methods
src/views/*.tsx   # one React view per view-bearing tool (file name = view.component)
cf-entry.ts       # worker entry for wrangler: re-exports skybridge's handler + the DO class
wrangler.jsonc    # DO binding + the load-bearing compat config (date >= 2025-09-01, define NODE_ENV)
deploy.mjs        # build + split modules[] (→ DO facet) / assets[] (→ R2); push to PMC is stubbed (see DEPLOY.md)
```

The kit ships an example **Tasks** app — replace it with your app (the skill walks you through it). It's a *plain*
MCP app (tools served directly, per-tool views — no shell wrapping), which is what deploys cleanly to PMC.

## Storage = DO only
DO SQL / DO KV only — **no D1, no external DBs** (PMC's model). All data goes through `getStore()` so it runs in
both dev modes and maps onto a PMC app-host facet. See `skill/references/persistence.md`.

## Deploy
`node deploy.mjs` splits the build (tools code vs view assets) and stages a deploy package; the PMC push lands
once `feat-app-host-ui` + `feat-oauth-front-door` do. See **DEPLOY.md**.
