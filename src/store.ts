/**
 * Task persistence — one interface, two backings:
 *   - `wrangler dev` (real local DO): proxies to the TaskDO Durable Object (DO SQL). Maps 1:1 onto a PMC
 *     app-host facet, so the app deploys cleanly.
 *   - `skybridge dev` (Node, no Workers runtime): an in-memory fallback for fast UI iteration.
 * `getStore()` picks at runtime by probing for the `cloudflare:workers` env + the TASK_DO binding.
 */
export type Task = { id: string; title: string; done: boolean };

export interface TaskStore {
  list(): Promise<Task[]>;
  add(title: string): Promise<void>;
  toggle(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

// ── in-memory (skybridge dev) ────────────────────────────────────────────────
const mem: Task[] = [];
let seq = 0;
const memStore: TaskStore = {
  async list() { return mem.map((t) => ({ ...t })); },
  async add(title) { mem.push({ id: `t${++seq}`, title, done: false }); },
  async toggle(id) { const t = mem.find((x) => x.id === id); if (t) t.done = !t.done; },
  async remove(id) { const i = mem.findIndex((x) => x.id === id); if (i >= 0) mem.splice(i, 1); },
};

// Resolve per call. IMPORTANT: a DO stub is a request-scoped I/O object — Workers forbids reusing one across
// requests ("Cannot perform I/O on behalf of a different request"), so we must NOT cache it. The in-memory store
// has no I/O objects, so caching it is fine.
export async function getStore(): Promise<TaskStore> {
  try {
    // `cloudflare:workers` is present only on the Workers runtime (wrangler dev / Cloudflare).
    const mod = (await import("cloudflare:workers" as string)) as { env?: Record<string, any> };
    const ns = mod.env?.TASK_DO;
    if (ns) {
      const stub = ns.get(ns.idFromName("default")); // FRESH stub each call — single-user local prototype → one DO
      return {
        list: () => stub.list(),
        add: (title: string) => stub.add(title),
        toggle: (id: string) => stub.toggle(id),
        remove: (id: string) => stub.remove(id),
      };
    }
  } catch {
    /* not on Workers → in-memory */
  }
  return memStore;
}
