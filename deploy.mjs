// PMC deploy — bundle the kit's app into the app-host contract and push it.
//
//   node deploy.mjs --base <your-PMC-url> --slug <app-slug> [--email .. --password ..]
//
// `<your-PMC-url>` is the USER's PMC front-door URL — ASK them for it. It is NOT hardcoded and has no default:
// usually a remote https URL (e.g. https://pmc.example.com); `http://localhost:<port>` only for your own local
// dev. You can also pass it via the `PMC_URL` env var. `<app-slug>` is the app's unique slug (lowercase; not a
// reserved name like `tasks`).
//
// Produces the two halves of the app-host manifest and ships them via `app.builder.deploy`:
//   modules = { "index.js": <facet> }   → the DurableObject facet (server/tools code; deploy-app/facet.js)
//   assets  = { "<comp>.html": {...} }  → the view, esbuilt to ONE self-contained HTML, served from R2
//   tools   = { name: { description, input, required, view? } }
import { build as esbuild } from "esbuild";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const requireHere = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : [])));
const base = String(args.base || process.env.PMC_URL || "").replace(/\/$/, "");
const slug = typeof args.slug === "string" ? args.slug : "";
if (!base || !slug) {
  console.error(
    "Usage: node deploy.mjs --base <your-PMC-url> --slug <app-slug> [--email .. --password ..]\n\n" +
      "  --base   the user's PMC front-door URL — ASK them for it. No default; usually a remote https URL\n" +
      "           (e.g. https://pmc.example.com), or http://localhost:<port> for local dev. (Or set PMC_URL.)\n" +
      "  --slug   the app's unique slug — lowercase, not a reserved name like 'tasks'.\n",
  );
  process.exit(2);
}

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

// esbuild plugin: bundle a tiny shim per react-family specifier that re-exports the package's full surface off
// window.__PMC_SHARED__ (the PMC shell publishes its live React there). So the deployed module ships WITHOUT React
// (shares the shell's instance) → bare ~KB module, blob-import-compatible under Claude's CSP.
const SHARED = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"];
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const sharedShimPlugin = {
  name: "pmc-shared-shim",
  setup(b) {
    const filter = new RegExp("^(" + SHARED.map((s) => s.replace(/\//g, "\\/")).join("|") + ")$");
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "pmc-shim" }));
    b.onLoad({ filter: /.*/, namespace: "pmc-shim" }, async (a) => {
      let names = [];
      try {
        names = Object.keys(await import(pathToFileURL(requireHere.resolve(a.path)).href)).filter((k) => k !== "default" && IDENT.test(k)).sort();
      } catch { /* subpath with no introspectable names → default-only shim */ }
      const key = JSON.stringify(a.path);
      const named = names.length ? `export const { ${names.join(", ")} } = __m\n` : "";
      return {
        contents: `const __s=globalThis.__PMC_SHARED__\nif(!__s||!__s[${key}])throw new Error('pmc shim: __PMC_SHARED__['+${key}+'] not set')\nconst __m=__s[${key}]\nexport default ('default' in __m?__m.default:__m)\n${named}`,
        loader: "js",
      };
    });
  },
};

// ── 1) build the view → a bare ESM MODULE exporting mount(el, ctx) ("B"). React → the shell's __PMC_SHARED__;
//      skybridge/web → the deploy shim (feeds the view's hooks from ctx). The shell blob-imports this module. ──
async function buildViewModule() {
  const out = await esbuild({
    entryPoints: [join(HERE, "deploy-app/view-entry.tsx")],
    bundle: true, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", minify: true, write: false,
    nodePaths: [join(HERE, "node_modules")],
    plugins: [sharedShimPlugin],
    alias: { "skybridge/web": join(HERE, "deploy-app/skybridge-shim.tsx") },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
    logLevel: "warning",
  });
  const js = out.outputFiles.find((f) => f.path.endsWith(".js") || f.path === "<stdout>")?.text ?? "";
  if (!js) throw new Error("view bundle produced no JS");
  return js;
}

// ── the tools manifest (must agree with the facet's method names + the view component) ───────────────────
const TOOLS = {
  show_tasks: { description: "Render the task list UI. Call to show/refresh the user's tasks.", input: {}, view: { component: "tasks" } },
  add_task: { description: "Add a task by title. Then call show_tasks to render.", input: { title: { type: "string" } }, required: ["title"], view: { component: "tasks" } },
  toggle_task: { description: "Check/uncheck a task by id.", input: { id: { type: "string" } }, required: ["id"] },
  delete_task: { description: "Delete a task by id.", input: { id: { type: "string" } }, required: ["id"] },
};

async function main() {
  console.log("→ building the view module…");
  const viewJs = await buildViewModule();
  const facet = readFileSync(join(HERE, "deploy-app/facet.js"), "utf8");
  console.log(`  view: ${(viewJs.length / 1024).toFixed(1)}KB (bare ESM module, shared React) · facet: ${(facet.length / 1024).toFixed(1)}KB`);
  if (args["build-only"]) {
    const { writeFileSync } = await import("node:fs");
    const outFile = join(HERE, "deploy-app/view.built.js");
    writeFileSync(outFile, viewJs);
    console.log(`✓ --build-only: wrote ${outFile}. Skipping the network deploy.`);
    process.exit(0);
  }

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
    modules: { "index.js": facet }, assets: { "tasks.js": { contents: viewJs } }, tools: TOOLS,
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
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$|\/)/.test(base);
  if (isLocal) {
    console.log(`\n   Claude Desktop (local PMC needs a tunnel): ngrok http ${base.split(":").pop()} → add a custom connector at`);
    console.log(`   <ngrok-https>/${oc}/${wc}/api/v1/apps/mcp   (Bearer ${key.slice(0, 12)}…)`);
  } else {
    console.log(`\n   Claude Desktop: add a custom connector at  ${conn}   (Bearer ${key.slice(0, 12)}…)`);
  }
}

main().catch((e) => { console.error("✗", e?.stack || e); process.exit(1); });
