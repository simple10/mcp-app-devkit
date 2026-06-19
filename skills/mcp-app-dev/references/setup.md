# Set up the dev kit

The **MCP App Dev Kit** is a skybridge-based repo you build the app inside. You either already have it (this skill
ships with it) or clone it.

## 1. Get the kit
```bash
git clone https://github.com/simple10/mcp-app-devkit.git
cd mcp-app-devkit
```
(If you already have the kit locally, just `cd` into it.)

## 2. Install + sanity-check
```bash
npm install
npm run dev            # starts the dev MCP server (skybridge dev) on a port (default 3010 if set, else 3000)
```
On start it prints the **local MCP URL** (`http://localhost:<port>/mcp`) and a **DevTools URL**
(`http://localhost:<port>/`). Read the logs — fix any errors before continuing. Hot reload is on (server +
view HMR), so edits apply live.

## 3. The layout you'll edit
```
mcp-app-devkit/
├── src/
│   ├── server.ts          # the MCP server — register your tools here
│   ├── store.ts           # getStore() — DO SQL persistence (see persistence.md). Usually you edit the schema/queries.
│   ├── task-do.ts         # the Durable Object class (DO SQL). Adjust its table + methods for your data.
│   ├── helpers.ts         # generateHelpers<AppType>() → typed useToolInfo / useCallTool for views
│   ├── index.css          # global styles (imported by every view)
│   └── views/
│       └── <component>.tsx # one React view per view-bearing tool (file name = view.component)
├── wrangler.jsonc         # DO binding (for `npm run dev:do` — real local DO)
├── vite.config.ts
└── package.json
```

The kit ships with an example **Tasks** app (`src/server.ts` + `src/views/tasks.tsx` + `src/store.ts` +
`src/task-do.ts`). **Replace it** with the user's app: rewrite the tools, the views, and the DO schema/queries.
Keep the patterns (one view per view-bearing tool; mutations via non-view tools; `getStore()` for data).

> The repo's view runtime + MCP wire are skybridge's; you only write tools + views + the DO. Don't fight the
> framework — register tools with `server.registerTool(...)` and bind views with the `view` field.
