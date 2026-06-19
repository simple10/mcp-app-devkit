# Run the dev server + connect Claude Desktop

## 1. Run the dev server
Two modes — both serve the MCP at `http://localhost:<port>/mcp` and a DevTools UI at `http://localhost:<port>/`:

```bash
npm run dev          # skybridge dev — fast UI iteration + HMR. Data uses the in-memory store. Use while building views.
npm run dev:do       # skybridge build && wrangler dev — REAL local Durable Object (DO SQL). Use to test persistence
                     # and for the connector you give the user (closest to how it runs on PMC).
```
Iterate with `npm run dev` for speed; switch to `npm run dev:do` when you want real DO persistence + the Claude
Desktop test.

## 2. Render views locally without an LLM (verify your work)
Open `http://localhost:<port>/` (the DevTools). Pick a tool, click **Run** — its view renders in the preview pane,
so you can eyeball layout/states before involving Claude Desktop. (With the Chrome DevTools MCP, you can also
`navigate_page` there and screenshot the `html-preview` iframe.)

## 3. Connect to Claude Desktop (the real test)
Claude Desktop needs a **remote HTTPS URL** to render MCP-App UI (a local `mcp-remote` connector is rejected for
UI). Expose the dev server with **ngrok** (no Alpic, no account-bound tunnel needed):
```bash
ngrok http <port>    # → https://<random>.ngrok-free.app
```
Then in Claude Desktop: **Settings → Connectors → Add custom connector** → name it, URL =
`https://<random>.ngrok-free.app/mcp`, **Authentication: None** → Create. (Dev mode needs no auth.)

In a chat: enable the connector (the `+` menu), then drive the app — ask the assistant to do something that calls
a tool, and the view renders inline. Edit code → the dev server hot-reloads → re-run in the chat to see changes.

**Caveats:** ngrok free URLs are ephemeral (re-add the connector if ngrok restarts). Keep `npm run dev:do` + ngrok
running during the session.

## 4. The iterate loop
1. Change a tool or view in `src/`.
2. The dev server hot-reloads (or `wrangler dev` rebuilds).
3. Re-trigger in Claude Desktop (or the DevTools preview) to see the change.
4. Repeat. Keep `SPEC.md` updated as the design evolves.
