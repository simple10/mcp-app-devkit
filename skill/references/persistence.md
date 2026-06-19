# Persistence — DO SQL only

PMC apps store data in a **Durable Object** — **DO SQL** (`ctx.storage.sql`) or **DO KV** (`ctx.storage`). **No
D1, no external databases.** This matches PMC's app-host facet exactly, so the app deploys cleanly.

The kit gives you one data interface with two backings so the *same app code* runs in both dev modes:
- `npm run dev:do` (wrangler) → the real Durable Object (`src/task-do.ts`), persisted on disk via miniflare.
- `npm run dev` (skybridge dev / Node) → an in-memory fallback, for fast UI iteration.

## The three files
**`src/store.ts`** — the interface + `getStore()`, which probes for the `cloudflare:workers` env + the DO binding
and returns the DO-backed store there, else the in-memory one. Adapt the interface to your data:
```ts
export interface TaskStore {
  list(): Promise<Task[]>;
  add(title: string): Promise<void>;
  toggle(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
```

**`src/task-do.ts`** — the Durable Object. Create your table in the constructor; expose async methods the store
calls (RPC over the stub). Rename/extend for your app:
```ts
import { DurableObject } from "cloudflare:workers";
export class TaskDO extends DurableObject {
  sql = this.ctx.storage.sql;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT, done INTEGER DEFAULT 0, ord INTEGER)`);
  }
  async list() { return [...this.sql.exec("SELECT id,title,done FROM tasks ORDER BY ord").raw()]
    .map(([id, title, done]) => ({ id: String(id), title: String(title), done: !!done })); }
  async add(title: string) { const ord = Date.now();
    this.sql.exec("INSERT INTO tasks (id,title,done,ord) VALUES (?,?,0,?)", crypto.randomUUID(), title, ord); }
  async toggle(id: string) { this.sql.exec("UPDATE tasks SET done = 1 - done WHERE id = ?", id); }
  async remove(id: string) { this.sql.exec("DELETE FROM tasks WHERE id = ?", id); }
}
```

**`cf-entry.ts`** (project root) — the worker entry wrangler uses. It re-exports skybridge's built entry
(`dist/__entry.js`, which sets the view manifest + the MCP fetch handler) **and** your DO class — Cloudflare
requires DO classes to be exported from the worker entry. Add your DO class here:
```ts
export { TaskDO } from "./src/task-do.js";
export { default } from "./dist/__entry.js";   // skybridge's built MCP handler (from `skybridge build`)
```
and `wrangler.jsonc` binds it. **Three settings are load-bearing** (a wrong compat date crashes the worker with
`http.createServer is not implemented`):
```jsonc
{
  "main": "cf-entry.ts",
  "compatibility_date": "2025-09-01",                 // >= 2025-09-01 → enables cloudflare:node's httpServerHandler
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "dist/assets" },           // skybridge's built views, served at the edge
  "define": { "process.env.NODE_ENV": "\"production\"" }, // forces prod under `wrangler dev` (else Vite leaks into the worker)
  "durable_objects": { "bindings": [{ "name": "TASK_DO", "class_name": "TaskDO" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["TaskDO"] }]
}
```
`@cloudflare/workers-types` must be installed (and referenced via `/// <reference types="@cloudflare/workers-types" />`
atop `task-do.ts`) so `skybridge build` type-checks the `cloudflare:workers` import.

## Rules
- **Single DO for a local single-user prototype** — `ns.get(ns.idFromName("default"))`. (On PMC, the facet is
  per-org; the kit doesn't need that locally.)
- Tools never touch the DO directly — always go through `getStore()`, so both dev modes work and the deploy maps.
- Keep data the LLM should see in `structuredContent`; keep view-only/bulky data out of it (see
  state-and-context.md).
