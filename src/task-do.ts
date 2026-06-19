/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";

/**
 * The app's data, in a Durable Object (DO SQL) — PMC's storage model. Tools never touch this directly; they go
 * through getStore() (store.ts), which proxies to this DO under `wrangler dev`. To adapt for a new app, change the
 * table + the methods; keep the method names in sync with the TaskStore interface in store.ts.
 */
type Task = { id: string; title: string; done: boolean };

export class TaskDO extends DurableObject {
  // `any` to avoid pulling in @cloudflare/workers-types in the kit; wrangler/esbuild strips types at build.
  private sql: any;

  constructor(ctx: any, env: any) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, ord INTEGER NOT NULL)`,
    );
  }

  async list(): Promise<Task[]> {
    return [...this.sql.exec("SELECT id, title, done FROM tasks ORDER BY ord").raw()].map(
      ([id, title, done]: [string, string, number]) => ({ id: String(id), title: String(title), done: !!done }),
    );
  }
  async add(title: string): Promise<void> {
    this.sql.exec("INSERT INTO tasks (id, title, done, ord) VALUES (?, ?, 0, ?)", crypto.randomUUID(), title, Date.now());
  }
  async toggle(id: string): Promise<void> {
    this.sql.exec("UPDATE tasks SET done = 1 - done WHERE id = ?", id);
  }
  async remove(id: string): Promise<void> {
    this.sql.exec("DELETE FROM tasks WHERE id = ?", id);
  }
}
