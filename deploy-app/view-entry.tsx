// Deploy view entry — esbuild bundles this into a single self-contained HTML asset for PMC (assets["tasks.html"]).
// Reuses the kit's React view (src/views/tasks.tsx); mountView boots the skybridge/ext-apps host bridge.
import { createElement } from "react";
import { mountView } from "skybridge/web";
import Tasks from "../src/views/tasks.js";

mountView(createElement(Tasks));
