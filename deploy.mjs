// PMC deploy — bundle the kit's app into the app-host contract and push it.
//
//   node deploy.mjs --base http://localhost:8760 [--slug tasks] [--email .. --password ..]
//
// Produces the two halves of the feat/app-host-ui manifest and ships them via `app.builder.deploy`:
//   modules = { "index.js": <facet> }   → the DurableObject facet (server/tools code; deploy-app/facet.js)
//   assets  = { "<comp>.html": {...} }  → the view, esbuilt to ONE self-contained HTML, served from R2
//   tools   = { name: { description, input, required, view? } }
// Auth + flow mirror services/app-host/examples/app-ui/deploy.py (the reference). Run a PMC stack with the
// landed app-host-ui (e.g. main / a worktree) first.
import { build as esbuild } from "esbuild";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : [])));
const base = String(args.base || process.env.MC_BASE || "http://localhost:8760").replace(/\/$/, "");
const slug = String(args.slug || "tasks");

// ── tiny fetch wrapper with a cookie jar (sign-in sets a session cookie /auth/token needs) ──────────────
const jar = {};
async function call(method, url, { body, token } = {}) {
  const headers = { "content-type": "application/json", origin: base };
  if (Object.keys(jar).length) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const [k, v] = kv.split("="); jar[k] = v; }
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

// ── 1) build the view → ONE self-contained HTML (no tailwind → clean IIFE bundle) ────────────────────────
async function buildViewHtml() {
  const reactDir = join(HERE, "node_modules/react");
  const reactDomDir = join(HERE, "node_modules/react-dom");
  const out = await esbuild({
    entryPoints: [join(HERE, "deploy-app/view-entry.tsx")],
    bundle: true, format: "iife", platform: "browser", target: "es2022", jsx: "automatic", minify: true, write: false,
    nodePaths: [join(HERE, "node_modules")],
    alias: { react: reactDir, "react-dom": reactDomDir },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
    logLevel: "warning",
  });
  const js = out.outputFiles.find((f) => f.path.endsWith(".js") || f.path === "<stdout>")?.text ?? "";
  const css = out.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  if (!js) throw new Error("view bundle produced no JS");
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>html,body{margin:0;padding:0;background:transparent}${css}</style>
<script>window.skybridge = { hostType: "mcp-app", serverUrl: "__PMC_ORIGIN__" };</script>
</head><body><div id="root"></div><script type="module">${js}</script></body></html>`;
}

// ── the tools manifest (must agree with the facet's method names + the view component) ───────────────────
const TOOLS = {
  show_tasks: { description: "Render the task list UI. Call to show/refresh the user's tasks.", input: {}, view: { component: "tasks" } },
  add_task: { description: "Add a task by title. Then call show_tasks to render.", input: { title: { type: "string" } }, required: ["title"], view: { component: "tasks" } },
  toggle_task: { description: "Check/uncheck a task by id.", input: { id: { type: "string" } }, required: ["id"] },
  delete_task: { description: "Delete a task by id.", input: { id: { type: "string" } }, required: ["id"] },
};

async function main() {
  console.log("→ building the view asset…");
  const viewHtml = await buildViewHtml();
  const facet = readFileSync(join(HERE, "deploy-app/facet.js"), "utf8");
  console.log(`  view: ${(viewHtml.length / 1024).toFixed(0)}KB · facet: ${(facet.length / 1024).toFixed(1)}KB`);

  // auth (sign-up fresh or sign-in) → identity token
  const stamp = Date.now();
  const email = String(args.email || `devkit${stamp}@example.test`);
  const password = String(args.password || "secret-pass-1234!");
  if (!args.email) await call("POST", `${base}/auth/sign-up/email`, { body: { name: "Dev Kit", email, password } });
  else await call("POST", `${base}/auth/sign-in/email`, { body: { email, password } });
  const tok = await call("POST", `${base}/auth/token`, { body: {} });
  const token = tok.json.token;
  if (!token) { console.error("✗ no auth token:", JSON.stringify(tok.json).slice(0, 300)); process.exit(1); }

  // org/workspace
  const org = await call("POST", `${base}/api/v1/orgs`, { token, body: { name: `Dev Kit ${stamp}` } });
  const oc = org.json?.org?.shortCode, wc = org.json?.workspace?.shortCode;
  if (!oc) { console.error("✗ org create failed:", JSON.stringify(org.json).slice(0, 300)); process.exit(1); }

  const mcpUrl = `${base}/${oc}/${wc}/api/v1/mcp`;
  let rid = 0;
  const mcp = async (name, argz, sid) => {
    const params = { name, arguments: argz || {} };
    if (sid) params.session_id = sid;
    const r = await call("POST", mcpUrl, { token, body: { jsonrpc: "2.0", id: ++rid, method: "tools/call", params } });
    const res = r.json?.result ?? r.json;
    const s = res?.structuredContent ?? {};
    return (s && typeof s === "object" && "result" in s) ? s.result : s;
  };

  const ssRaw = await call("POST", mcpUrl, { token, body: { jsonrpc: "2.0", id: ++rid, method: "tools/call", params: { name: "session.start", arguments: { include_guidance: false } } } });
  if (process.env.DEBUG) console.log("  session.start raw:", JSON.stringify(ssRaw.json).slice(0, 400));
  const ssRes = ssRaw.json?.result ?? ssRaw.json;
  const sid = (ssRes?.structuredContent?.result ?? ssRes?.structuredContent ?? {})?.session_id;
  console.log("→ session", sid, "→ app.builder.deploy…");
  const dRaw = await call("POST", mcpUrl, { token, body: { jsonrpc: "2.0", id: ++rid, method: "tools/call", params: { name: "app.builder.deploy", session_id: sid, arguments: {
    app: slug, name: "Tasks", summary: "A simple task list with an interactive checklist UI.",
    modules: { "index.js": facet }, assets: { "tasks.html": { contents: viewHtml, type: "text" } }, tools: TOOLS,
  } } } });
  const dRes = dRaw.json?.result ?? dRaw.json;
  const d = dRes?.structuredContent?.result ?? dRes?.structuredContent ?? {};
  if (!d?.ok) { console.error("✗ deploy failed (status " + dRaw.status + "):", JSON.stringify(dRes).slice(0, 900)); process.exit(1); }

  const sid2 = (await mcp("session.start", { include_guidance: false }))?.session_id;
  const agentId = (await mcp("agents.create", { name: "Tasks Connector", role: "member" }, sid2))?.agent?.id;
  const key = (await mcp("tokens.create", { principalId: agentId, name: "claude-desktop" }, sid2))?.key || "";

  const conn = `${base}/${oc}/${wc}/api/v1/apps/mcp`;
  console.log(`\n✅ Deployed '${slug}' to org ${oc} / ws ${wc}.`);
  console.log(`   Shell connector: ${conn}`);
  console.log(`   Agent key:       ${key}`);
  console.log(`   Account:         ${email} / ${password}`);
  console.log(`\n   Claude Desktop: ngrok http ${base.split(":").pop()} → add <ngrok>/${oc}/${wc}/api/v1/apps/mcp (Bearer ${key.slice(0, 12)}…)`);
}

main().catch((e) => { console.error("✗", e?.stack || e); process.exit(1); });
