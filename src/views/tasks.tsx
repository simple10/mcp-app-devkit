// Tasks view. NOTE: uses INLINE STYLES (a style object), not tailwind/CSS imports — so it bundles into a single
// self-contained HTML asset for PMC deploy (esbuild IIFE; tailwind can't process there). Inline styles render
// identically under skybridge dev. This is the deployability convention for kit views.
import { useEffect, useState } from "react";
import { useLayout } from "skybridge/web";
import { useToolInfo, useCallTool } from "../helpers.js";

type Task = { id: string; title: string; done: boolean };

export default function Tasks() {
  const { theme } = useLayout();
  const dark = theme === "dark";
  const info = useToolInfo<"show_tasks">();
  const add = useCallTool("add_task");
  const toggle = useCallTool("toggle_task");
  const del = useCallTool("delete_task");

  const [tasks, setTasks] = useState<Task[]>(() => (info.output as { tasks?: Task[] } | undefined)?.tasks ?? []);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const t = (info.output as { tasks?: Task[] } | undefined)?.tasks;
    if (t) setTasks(t);
  }, [info.output]);

  const apply = (data: unknown) => {
    const t = (data as { structuredContent?: { tasks?: Task[] } } | undefined)?.structuredContent?.tasks;
    if (t) setTasks(t);
  };
  const onAdd = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    apply(await add.callToolAsync({ title }));
  };

  const done = tasks.filter((t) => t.done).length;
  const c = palette(dark);
  const S = styles(c);

  return (
    <div style={S.card} data-llm={`Task list: ${done}/${tasks.length} done.`}>
      <div style={S.header}>
        <span style={S.dot} />
        <span style={S.h1}>Tasks</span>
        <span style={S.count}>{done}/{tasks.length} done</span>
      </div>

      <div style={S.addRow}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Add a task…"
          style={S.input}
        />
        <button type="button" onClick={onAdd} disabled={!draft.trim()} style={{ ...S.addBtn, opacity: draft.trim() ? 1 : 0.4 }}>+ Add</button>
      </div>

      {tasks.length ? (
        <ul style={S.list}>
          {tasks.map((t) => (
            <li key={t.id} style={S.row}>
              <button type="button" onClick={() => apply(toggle.callToolAsync({ id: t.id }))} style={S.checkBtn} aria-label="toggle">
                <span style={{ ...S.check, ...(t.done ? S.checkOn : {}) }}>{t.done ? "✓" : ""}</span>
              </button>
              <span style={{ ...S.title, ...(t.done ? S.titleDone : {}) }}>{t.title}</span>
              <button type="button" onClick={() => apply(del.callToolAsync({ id: t.id }))} style={S.delBtn} aria-label="delete">✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={S.empty}>No tasks yet — add one above, or ask the assistant.</div>
      )}
    </div>
  );
}

function palette(dark: boolean) {
  return dark
    ? { bg: "#16161a", fg: "#e7e7ea", sub: "#9a9aa2", border: "#2a2a31", card: "#1d1d22", primary: "#6366f1", primaryFg: "#fff", on: "#34d399" }
    : { bg: "#fff", fg: "#1c1c22", sub: "#6b7280", border: "#e6e6ea", card: "#fafafb", primary: "#6366f1", primaryFg: "#fff", on: "#10b981" };
}
function styles(c: ReturnType<typeof palette>): Record<string, React.CSSProperties> {
  return {
    card: { maxWidth: 640, margin: "0 auto", border: `1px solid ${c.border}`, borderRadius: 16, background: c.bg, color: c.fg, overflow: "hidden", fontFamily: "system-ui, sans-serif" },
    header: { display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: `1px solid ${c.border}` },
    dot: { width: 10, height: 10, borderRadius: 3, background: c.primary, display: "inline-block" },
    h1: { fontSize: 15, fontWeight: 600 },
    count: { marginLeft: "auto", fontSize: 12, color: c.sub },
    addRow: { display: "flex", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${c.border}` },
    input: { flex: 1, minWidth: 0, border: `1px solid ${c.border}`, borderRadius: 8, background: c.card, color: c.fg, padding: "8px 12px", fontSize: 14, outline: "none" },
    addBtn: { border: "none", borderRadius: 8, background: c.primary, color: c.primaryFg, padding: "8px 14px", fontSize: 14, fontWeight: 500, cursor: "pointer" },
    list: { listStyle: "none", margin: 0, padding: 0 },
    row: { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: `1px solid ${c.border}` },
    checkBtn: { border: "none", background: "transparent", padding: 0, cursor: "pointer" },
    check: { width: 20, height: 20, borderRadius: "50%", border: `2px solid ${c.sub}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "transparent" },
    checkOn: { borderColor: c.on, background: c.on, color: "#fff" },
    title: { flex: 1, fontSize: 14 },
    titleDone: { color: c.sub, textDecoration: "line-through" },
    delBtn: { border: "none", background: "transparent", color: c.sub, cursor: "pointer", fontSize: 14 },
    empty: { padding: 24, textAlign: "center", fontSize: 14, color: c.sub },
  };
}
