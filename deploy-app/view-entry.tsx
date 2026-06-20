// PMC deploy view entry ("B"). Exports `mount(el, ctx)` → renders the kit's UNCHANGED skybridge view (backed by
// the deploy skybridge-shim, which feeds the view's hooks from `ctx`) as a bare ESM module the PMC shell
// blob-imports. React is shared with the shell via __PMC_SHARED__ (deploy.mjs build-time) → the module is ~KB, no
// bundled React. `update(data)` lets the shell push a sibling view's live change, or the durable store on reopen.
import { createElement } from "react";
import { __pmcInit, __pmcUpdate } from "./skybridge-shim.js";
import View from "../src/views/tasks.js";
import { createRoot } from "react-dom/client";

type Ctx = { data: unknown; callTool: (action: string, args?: Record<string, unknown>) => Promise<unknown> };

export function mount(el: HTMLElement, ctx: Ctx): { update(data: unknown): void; unmount(): void } {
  __pmcInit(ctx);
  const root = createRoot(el);
  root.render(createElement(View));
  return {
    update(data) {
      __pmcUpdate(data);
    },
    unmount() {
      root.unmount();
    },
  };
}
