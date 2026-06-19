// PMC app-host FACET for the Tasks app — the deploy artifact shipped as modules["index.js"].
//
// This is the format PMC's AppRunner loads (matches services/app-host/examples/app-ui/goal-tasks.app.js):
// a DurableObject named `App` whose public async methods ARE the MCP tools. Each takes (input, ctx) where ctx
// has { org_id, workspace_id }; uses the facet's own `ctx.storage.sql` (per-org isolated by the AppRunner);
// scopes every row by workspace_id (the tenant wall inside the org facet); returns a full MCP tool result
// { content, structuredContent }. The view reads structuredContent.
//
// NOTE (follow-up): today this mirrors the local skybridge app (src/server.ts + task-do.ts). The clean design is
// single-source — generate this facet from the app's tools, or run this facet locally via a skybridge wrapper.
// For now the deploy ships this; keep the tool names + the structuredContent shape in sync with the view.
import { DurableObject } from "cloudflare:workers";

export class App extends DurableObject {
  #ready = false;
  #ensure() {
    if (this.#ready) return;
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS tasks (
         id TEXT PRIMARY KEY, org_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
         title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, ord INTEGER NOT NULL )`,
    );
    this.#ready = true;
  }
  #list(ws) {
    return [...this.ctx.storage.sql.exec("SELECT id, title, done FROM tasks WHERE workspace_id = ? ORDER BY ord", ws).raw()]
      .map(([id, title, done]) => ({ id: String(id), title: String(title), done: !!done }));
  }
  #result(ws, text) {
    const tasks = this.#list(ws);
    const done = tasks.filter((t) => t.done).length;
    return { content: [{ type: "text", text: text ?? `${done}/${tasks.length} task(s) done.` }], structuredContent: { tasks } };
  }

  async show_tasks(_input, ctx) {
    this.#ensure();
    return this.#result(ctx.workspace_id, `${this.#list(ctx.workspace_id).length} task(s).`);
  }
  async add_task(input, ctx) {
    this.#ensure();
    const ws = ctx.workspace_id;
    this.ctx.storage.sql.exec(
      "INSERT INTO tasks (id, org_id, workspace_id, title, done, ord) VALUES (?,?,?,?,0,?)",
      crypto.randomUUID(), ctx.org_id, ws, String(input?.title ?? "").trim(), Date.now(),
    );
    return this.#result(ws, `Added "${input?.title}".`);
  }
  async toggle_task(input, ctx) {
    this.#ensure();
    const ws = ctx.workspace_id;
    this.ctx.storage.sql.exec("UPDATE tasks SET done = 1 - done WHERE id = ? AND workspace_id = ?", input?.id, ws);
    return this.#result(ws, "Toggled.");
  }
  async delete_task(input, ctx) {
    this.#ensure();
    const ws = ctx.workspace_id;
    this.ctx.storage.sql.exec("DELETE FROM tasks WHERE id = ? AND workspace_id = ?", input?.id, ws);
    return this.#result(ws, "Deleted.");
  }
}
