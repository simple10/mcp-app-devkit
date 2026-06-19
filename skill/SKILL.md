---
name: pmc-app-dev
description: |
  Build and iterate on MCP apps (tools + custom UI views) for Portkey Mission Control, using the local PMC App
  Dev Kit. Covers the full local loop: brainstorm against UX guidelines, scaffold tools/views in the dev kit,
  persist data in a local Durable Object (DO SQL), run the dev server, expose it with ngrok, connect it to Claude
  Desktop / ChatGPT as an MCP connector, and iterate. Use when a user wants to create, prototype, or update a PMC
  app / MCP app with a UI.
---

# Building MCP Apps for Portkey Mission Control

These are conversational experiences that extend an AI assistant through **tools** + custom **UI views**, built as
an MCP server. You prototype them locally in the **PMC App Dev Kit** (a skybridge-based dev server) and test them
live in Claude Desktop over an ngrok tunnel. Later they deploy to PMC, where any agent (Claude, ChatGPT) can use
them — but **this skill is the local build/prototype loop**.

⚠️ The app is consumed by **two users at once**: the **human** (interacts with the view) and the **AI assistant
LLM** (sees the view's state + decides which tool to call next). The view is your shared surface — internalize this
before writing code.

**Keep a `SPEC.md`** in the app, capturing requirements + design decisions. No SPEC.md yet? → read
[discover.md](references/discover.md) and write one first. Then read [architecture.md](references/architecture.md)
to design, update SPEC.md, and only then implement.

## The loop (what you do, in order)

1. **Set up the kit** → [setup.md](references/setup.md): locate/clone the dev kit, install, confirm it runs.
2. **Design** → [discover.md](references/discover.md) + [architecture.md](references/architecture.md): the tools,
   the views, the data, the multi-turn flow.
3. **Implement** — ⚠️ **read [kit-conventions.md](references/kit-conventions.md) FIRST.** It's the authoritative
   kit contract (the `export default await server.run()` entry, `outputSchema`, `viewUUID`, `callToolAsync`, the
   DO-rename checklist, the view-name registry codegen, the wire-verify recipe, benign telemetry). The other
   references are forked from skybridge's generic skill and occasionally diverge — **where they differ from the
   kit's actual files, the kit wins; copy the example `src/server.ts` / `src/views/tasks.tsx` / `src/store.ts`.**
   - **Tools + views** → [fetch-and-render-data.md](references/fetch-and-render-data.md): register tools in
     `src/server.ts`; a view-bearing tool gets `view: { component }` → `src/views/<component>.tsx`.
   - **Persist data** → [persistence.md](references/persistence.md): the `getStore()` pattern over **DO SQL**
     (PMC's storage model — never use D1/external DBs).
   - **View ↔ LLM** → [state-and-context.md](references/state-and-context.md) (push state the model reads) and
     [prompt-llm.md](references/prompt-llm.md) (a view button that steers the conversation).
   - **Layout/UX** → [ui-guidelines.md](references/ui-guidelines.md). **External resources** →
     [csp.md](references/csp.md).
4. **Run + connect** → [run-and-connect.md](references/run-and-connect.md): `npm run dev`, `ngrok http <port>`,
   add the ngrok URL as a Claude Desktop custom connector (no auth), iterate (edit → reload → re-test).

## Hard rules for PMC apps

- **Storage is DO SQL / DO KV only** — no D1, no external databases (see persistence.md). Data access goes through
  `getStore()` so the same code runs under `skybridge dev` (in-memory) and `wrangler dev` (real local DO), and
  deploys cleanly onto a PMC app-host facet.
- **One view backs exactly one tool** (skybridge enforces this). Render with one view-bearing tool; do mutations
  with non-view tools the view calls back via `useCallTool`, or that the assistant calls then re-renders.
- **No real auth in the local loop** — Claude Desktop connects to the ngrok URL with auth = None. (Production auth
  is handled by PMC, not the app.)
- **Make it genuinely good**: read [architecture.md](references/architecture.md) + ui-guidelines.md before
  building. A view is the shared human/LLM surface — design the data the model sees (`structuredContent`,
  `data-llm`) as deliberately as the pixels.

## Reference
Full skybridge view API (the `skybridge/web` hooks: `useToolInfo`, `useCallTool`, `useSendFollowUpMessage`,
`useViewState`, `DataLLM`, `mountView`): <https://docs.skybridge.tech/api-reference.md>
