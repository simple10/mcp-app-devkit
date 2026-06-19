// Cloudflare worker entry for `wrangler dev` / deploy (real local DO).
// Re-exports skybridge's built MCP handler (dist/__entry.js sets the view manifest + the fetch handler) and
// exports the Durable Object class — Cloudflare requires DO classes to be exported from the worker entry.
export { TaskDO } from "./src/task-do.js";
export { default } from "./dist/__entry.js";
