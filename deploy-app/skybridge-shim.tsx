// DEPLOY-ONLY shim for `skybridge/web`. The kit's view uses skybridge view hooks (useToolInfo / useCallTool /
// useLayout); `skybridge dev` (the local loop) keeps the REAL skybridge. For a PMC deploy, deploy.mjs aliases
// `skybridge/web` to THIS module, backing those hooks with the PMC shell's "B" mount ctx ({ data, callTool })
// instead of the host bridge. So the UNCHANGED skybridge component bundles into a bare ~KB PMC view module that
// the shell blob-imports + mounts. `__pmcInit`/`__pmcUpdate` are driven by view-entry's mount()/update().
import { useEffect, useState } from 'react'

type Ctx = {
  data: unknown
  callTool: (action: string, args?: Record<string, unknown>) => Promise<unknown>
  theme?: string
}

let _ctx: Ctx = { data: null, callTool: async () => null, theme: 'light' }
const _subs = new Set<(d: unknown) => void>()

/** Set by view-entry mount(): the initial ctx (data + callTool) from the PMC shell. */
export function __pmcInit(ctx: Ctx): void {
  _ctx = { theme: 'light', ...ctx }
}
/** Set by view-entry update(): a fresh snapshot (a sibling view's live change, or the durable store on reopen). */
export function __pmcUpdate(data: unknown): void {
  _ctx = { ..._ctx, data }
  _subs.forEach((s) => s(data))
}

/** Reactive: re-renders when the shell pushes new data (cross-view sync). `output` = the tool's structuredContent. */
export function useToolInfo<_T = unknown>() {
  const [data, setData] = useState<unknown>(_ctx.data)
  useEffect(() => {
    const s = (d: unknown) => setData(d)
    _subs.add(s)
    setData(_ctx.data) // adopt any data committed between render and effect
    return () => {
      _subs.delete(s)
    }
  }, [])
  return { output: data, isPending: false }
}

/** A tool handle. `callToolAsync` round-trips through the PMC shell's bridge; result is shaped `{ structuredContent }`
 *  to match the skybridge contract the kit view reads. */
export function useCallTool(name: string) {
  const run = async (args?: Record<string, unknown>) => ({ structuredContent: await _ctx.callTool(name, args ?? {}) })
  return { callTool: run, callToolAsync: run }
}

/** Mirror of skybridge's generateHelpers (the kit's src/helpers.ts calls this). */
export function generateHelpers<_T = unknown>() {
  return { useToolInfo, useCallTool }
}

export function useLayout() {
  return { theme: _ctx.theme ?? 'light' }
}

/** No-op on deploy — view-entry's mount() owns rendering. */
export function mountView(): void {}

export const McpAppBridge = {} as Record<string, unknown>
