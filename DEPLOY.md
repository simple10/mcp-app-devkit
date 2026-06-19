# Deploying a dev-kit app to PMC

**Status: WORKING + verified end-to-end** against a live PMC stack with the landed `app-host-ui` (`node deploy.mjs`
→ `app.builder.deploy` → the deployed app runs its facet in a per-org DO + serves its view from R2, usable via the
shell connector `open_apps`+`invoke`).

## The two halves of the manifest
`node deploy.mjs` bundles the kit's app into PMC's app-host contract and splits it cleanly:

| Bucket | Goes to | What | Source |
|---|---|---|---|
| **`modules`** | per-org **DO facet** (runs the tools) | `{ "index.js": <facet> }` — a `DurableObject` named `App` whose async methods ARE the tools `(input, ctx)` → `{content, structuredContent}`, on `ctx.storage.sql`, scoped by `ctx.workspace_id` | `deploy-app/facet.js` |
| **`assets`** | **R2**, served directly | `{ "<component>.html": {contents, type} }` — the view as ONE self-contained HTML (esbuild IIFE) | `src/views/*.tsx` → `deploy-app/view-entry.tsx` |
| `tools` | the manifest | `{ name: {description, input, required, view?: {component}} }` | `deploy.mjs` `TOOLS` |

The 540KB+ view is static → R2; the facet stays tiny. A view-bearing tool's `view.component` maps to the
`<component>.html` asset.

## Run it
```bash
# against a PMC stack that has the landed app-host-ui (e.g. main on :8700)
node deploy.mjs --base http://localhost:8700 --slug mytasks   # NB: "tasks" is a reserved slug
# → prints the shell connector URL + an agent key. For Claude Desktop:
#   ngrok http 8700  → add <ngrok>/<org>/<ws>/api/v1/apps/mcp  (Bearer <agent key>)
```
It signs up a fresh account (or `--email/--password` to reuse), creates an org, `session.start`s, calls
`app.builder.deploy`, then mints an agent key. Verified flow: `open_apps` lists the app; `invoke {app, action,
...args}` runs the facet (DO SQL persists) and renders the view.

## ⚠️ Deployability constraint: views use INLINE STYLES, not tailwind
The view bundles to ONE self-contained HTML via an esbuild IIFE (no vite/tailwind pipeline there), so kit views
**must use inline styles** (a style object), not tailwind classes / CSS imports — see `src/views/tasks.tsx`. Inline
styles render identically under `skybridge dev`, so this costs nothing locally and makes the view deployable.

## Known follow-ups
- **Single-source the facet.** Today `deploy-app/facet.js` mirrors the local skybridge app (`src/server.ts` +
  `src/task-do.ts`) by hand — keep tool names + the `structuredContent` shape in sync. The clean design: generate
  the facet from the app's tools, or run the facet locally via a thin skybridge wrapper (one source of truth).
- **Auth.** `deploy.mjs` uses email/password signup for the dev loop. Production deploy should authenticate via the
  OAuth front-door connection token (`feat-oauth-front-door`).
- **Multi-view apps.** `TOOLS` + the esbuild entry currently assume one view (`tasks`); generalize to N components.
