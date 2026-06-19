import { McpServer } from "skybridge/server";
import { z } from "zod";
import { getStore } from "./store.js";

/**
 * MCP App Dev Kit — example "Tasks" app.
 *
 * A plain MCP app (no shell wrapping): tools are served directly, one view-bearing tool (`show_tasks`)
 * renders the list; mutations (`add_task`/`toggle_task`/`delete_task`) are non-view tools the view calls
 * back via `useCallTool` (and Claude calls `show_tasks` to render). This is the shape that deploys cleanly
 * onto PMC's app-host facet.
 *
 * Persistence goes through `getStore()` — backed by **DO SQL** under `wrangler dev` (real local DO) and an
 * in-memory fallback under `skybridge dev` (fast UI iteration). Same code both ways. See store.ts.
 */

const TaskSchema = z.object({ id: z.string(), title: z.string(), done: z.boolean() });

const server = new McpServer({ name: "tasks", version: "0.1.0" }, { capabilities: {} })
  .registerTool(
    {
      name: "show_tasks",
      description:
        "Render the task list UI. Call this to show or refresh the user's tasks (e.g. right after adding tasks, or when they ask to see their list).",
      inputSchema: {},
      annotations: { title: "Show tasks", readOnlyHint: true },
      outputSchema: { tasks: z.array(TaskSchema) },
      view: { component: "tasks", description: "The task checklist." },
    },
    async () => {
      const tasks = await (await getStore()).list();
      return { structuredContent: { tasks }, content: [{ type: "text", text: `${tasks.length} task(s).` }] };
    },
  )
  .registerTool(
    {
      name: "add_task",
      description: "Add a task by title. After adding, call show_tasks to render the updated list.",
      inputSchema: { title: z.string().describe("The task title.") },
      annotations: { title: "Add task" },
      outputSchema: { tasks: z.array(TaskSchema) },
    },
    async ({ title }) => {
      const store = await getStore();
      await store.add(title);
      const tasks = await store.list();
      return { structuredContent: { tasks }, content: [{ type: "text", text: `Added "${title}". ${tasks.length} task(s).` }] };
    },
  )
  .registerTool(
    {
      name: "toggle_task",
      description: "Toggle a task's done state by id. The task view calls this when the user checks a box.",
      inputSchema: { id: z.string() },
      annotations: { title: "Toggle task" },
      outputSchema: { tasks: z.array(TaskSchema) },
    },
    async ({ id }) => {
      const store = await getStore();
      await store.toggle(id);
      return { structuredContent: { tasks: await store.list() }, content: [{ type: "text", text: "Toggled." }] };
    },
  )
  .registerTool(
    {
      name: "delete_task",
      description: "Delete a task by id. The task view calls this when the user removes a task.",
      inputSchema: { id: z.string() },
      annotations: { title: "Delete task" },
      outputSchema: { tasks: z.array(TaskSchema) },
    },
    async ({ id }) => {
      const store = await getStore();
      await store.remove(id);
      return { structuredContent: { tasks: await store.list() }, content: [{ type: "text", text: "Deleted." }] };
    },
  );

export default await server.run();
export type AppType = typeof server;
