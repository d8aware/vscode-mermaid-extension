/**
 * Explorer mode for the diagram webview ("Explore Classes From Here").
 * Activated by an `explorerMode` message; the normal preview never runs this.
 *
 * - Clicking a class box posts `nodeClick` (a drag to pan is not a click).
 * - Toolbar: Back, Start over, Save view.
 * - Loading states: an animated "mapping" scene with real progress while the
 *   project is analysed, and a dim + shimmer + pulse while a step re-renders.
 */

type Api = { postMessage(message: unknown): void };

const STYLE = `
:root { --accent: #6366f1; --accent-soft: rgba(99,102,241,.14); --ink: #27272a; --muted: #71717a; --line: #d4d4d8;
  --surface: #fff; --page: #fff; --track: #f4f4f5; --amber: #f59e0b; --green: #22c55e; --on-accent: #fff; --on-amber: #fff; }
#explorer-toolbar { position: fixed; top: 10px; left: 10px; z-index: 30; display: flex; gap: 6px; align-items: center;
  font: 12px system-ui, sans-serif; }
#explorer-toolbar button { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 6px;
  padding: 4px 10px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
#explorer-toolbar button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
#explorer-toolbar button:disabled { opacity: .45; cursor: default; }
#explorer-toolbar .title { color: var(--muted); margin-left: 6px; max-width: 50vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#explorer-toolbar .crumb { color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
#explorer-toolbar .crumb:hover { color: var(--ink); }
#explorer-toolbar .here { color: var(--ink); font-weight: 600; }
#explorer-toolbar .sep { color: var(--line); margin: 0 4px; }
#explorer-hint { position: fixed; bottom: 10px; left: 10px; z-index: 30; font: 11px system-ui, sans-serif; color: var(--muted); }
#explorer-hint .note { display: block; margin-top: 2px; }

/* Analysing: full-panel scene */
#explorer-overlay { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 18px; background: var(--page); transition: opacity .35s ease; font-family: system-ui, sans-serif; }
#explorer-overlay.done { opacity: 0; pointer-events: none; }
#explorer-overlay svg .node { fill: var(--surface); stroke: var(--line); stroke-width: 1.5; animation: light 2.4s ease-in-out infinite; }
#explorer-overlay svg .edge { stroke: var(--line); stroke-width: 1.5; stroke-dasharray: 4 4; animation: flow 1.2s linear infinite; }
#explorer-overlay svg .node:nth-of-type(2) { animation-delay: .3s } #explorer-overlay svg .node:nth-of-type(3) { animation-delay: .6s }
#explorer-overlay svg .node:nth-of-type(4) { animation-delay: .9s } #explorer-overlay svg .node:nth-of-type(5) { animation-delay: 1.2s }
@keyframes light { 0%,100% { stroke: var(--line); fill: var(--surface); } 40% { stroke: var(--accent); fill: var(--accent-soft); } }
@keyframes flow { to { stroke-dashoffset: -16; } }
#explorer-overlay .label { font-size: 14px; color: var(--ink); }
#explorer-overlay .bar { width: min(320px, 70vw); height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
#explorer-overlay .bar > div { height: 100%; width: 0; background: var(--accent); border-radius: 2px; transition: width .2s ease; }
#explorer-overlay .bar.indeterminate > div { width: 30%; animation: slide 1.1s ease-in-out infinite; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
#explorer-overlay .detail { font-size: 12px; color: var(--muted); min-height: 1.2em; font-variant-numeric: tabular-nums; }

/* Stepping: dim, shimmer, pulse */
#explorer-shimmer { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 35; overflow: hidden; opacity: 0; transition: opacity .15s; }
#explorer-shimmer::after { content: ""; position: absolute; inset: 0; width: 35%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent); animation: slide 1s ease-in-out infinite; }
body.exploring #explorer-shimmer { opacity: 1; }
body.exploring #content svg { opacity: .45; transition: opacity .2s; }
body.exploring #content g.node.clicked { opacity: 1; animation: pulse .9s ease-in-out infinite; }
@keyframes pulse { 50% { filter: drop-shadow(0 0 6px var(--accent)); } }
body.explorer #content svg { animation: arrive .35s ease-out; }
@keyframes arrive { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
body.explorer #content g.node { cursor: pointer; }
body.explorer #content g.node:hover { filter: drop-shadow(0 0 4px var(--accent)); }

@media (prefers-reduced-motion: reduce) {
  #explorer-overlay svg .node, #explorer-overlay svg .edge, #explorer-shimmer::after,
  #explorer-overlay .bar.indeterminate > div, body.exploring #content g.node.clicked, body.explorer #content svg { animation: none; }
  #explorer-overlay .bar.indeterminate > div { width: 100%; opacity: .4; }
}
`;

// A small abstract class graph: five boxes and the lines between them.
const SCENE = `
<svg width="220" height="120" viewBox="0 0 220 120" aria-hidden="true">
  <line class="edge" x1="110" y1="34" x2="40" y2="86"/><line class="edge" x1="110" y1="34" x2="110" y2="86"/>
  <line class="edge" x1="110" y1="34" x2="180" y2="86"/><line class="edge" x1="40" y1="96" x2="110" y2="96"/>
  <rect class="node" x="84" y="10" width="52" height="28" rx="4"/>
  <rect class="node" x="14" y="82" width="52" height="28" rx="4"/>
  <rect class="node" x="84" y="82" width="52" height="28" rx="4"/>
  <rect class="node" x="154" y="82" width="52" height="28" rx="4"/>
  <rect class="node" x="160" y="10" width="40" height="22" rx="4" opacity=".6"/>
</svg>`;

let api: Api | undefined;
let active = false;
let pointerStart: { x: number; y: number } | undefined;

export function isExplorer(): boolean {
  return active;
}

/** Called for `explorerMode`; idempotent. */
export function enableExplorer(vscodeApi: Api | undefined, title = "") {
  api = vscodeApi;
  if (!active) {
    active = true;
    document.body.classList.add("explorer");
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="explorer-toolbar">
         <button data-action="back" title="Undo the last step">← Back</button>
         <button data-action="reset" title="Back to the file you started from">Start over</button>
         <button data-action="save" title="Save this view as a .mmd file">Save view</button>
         <span class="title"></span>
       </div>
       <div id="explorer-hint">Click a box to explore it · hover a box for details</div>
       <div id="explorer-shimmer"></div>
       <div id="explorer-overlay" class="done">${SCENE}
         <div class="label">Mapping classes…</div>
         <div class="bar indeterminate"><div></div></div>
         <div class="detail"></div>
       </div>`
    );
    document.querySelectorAll<HTMLButtonElement>("#explorer-toolbar button").forEach((button) =>
      button.addEventListener("click", () => {
        setStepping(true);
        api?.postMessage({ command: button.dataset.action });
      })
    );
  }
  if (title) {
    document.querySelector("#explorer-toolbar .title")!.textContent = title;
  }
}

/** Breadcrumb: every segment but the last navigates there. */
function setCrumbs(crumbs: string[] | undefined) {
  const holder = document.querySelector<HTMLElement>("#explorer-toolbar .title")!;
  if (!crumbs?.length) {
    return;
  }
  holder.replaceChildren(
    ...crumbs.flatMap((label, index) => {
      const part = document.createElement("span");
      part.textContent = label;
      if (index < crumbs.length - 1) {
        part.className = "crumb";
        part.addEventListener("click", () => {
          setStepping(true);
          api?.postMessage({ command: "crumb", index });
        });
      } else {
        part.className = "here";
      }
      if (index === 0) {
        return [part];
      }
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      return [sep, part];
    })
  );
}

/** Analysis progress: total 0 = unknown (indeterminate bar); `detail` overrides the counter text. */
export function showAnalysis(label: string, done: number, total: number, file?: string, detail?: string) {
  const overlay = document.getElementById("explorer-overlay")!;
  overlay.classList.remove("done");
  overlay.querySelector(".label")!.textContent = label;
  const bar = overlay.querySelector<HTMLDivElement>(".bar")!;
  bar.classList.toggle("indeterminate", total === 0);
  (bar.firstElementChild as HTMLDivElement).style.width = total ? `${Math.round((done / total) * 100)}%` : "";
  overlay.querySelector(".detail")!.textContent =
    detail ?? (total ? `${done.toLocaleString()} / ${total.toLocaleString()} files${file ? ` · ${file}` : ""}` : "");
}

export function setStepping(on: boolean) {
  document.body.classList.toggle("exploring", on);
}

/** The extension has no change to show (e.g. Back at the start, a cancelled pick). */
export function settle(state: { canGoBack: boolean }) {
  // Nothing new to show (no classes, cancelled, failed): the loading scene must not stay up.
  document.getElementById("explorer-overlay")?.classList.add("done");
  setStepping(false);
  document.querySelector<HTMLButtonElement>('#explorer-toolbar [data-action="back"]')!.disabled = !state.canGoBack;
}

/** After each render: drop loading states, set the breadcrumb, make boxes clickable. */
export function onRendered(state: { canGoBack: boolean; crumbs?: string[]; tooltips?: Record<string, string>; notes?: string[] }) {
  document.getElementById("explorer-overlay")?.classList.add("done");
  settle(state);
  setCrumbs(state.crumbs);
  // Where the view's answers came from a fallback rule (e.g. no type hierarchy).
  const hint = document.getElementById("explorer-hint")!;
  hint.replaceChildren(
    document.createTextNode("Click a box to explore it · hover a box for details"),
    ...(state.notes ?? []).map((text) => {
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = text;
      return note;
    })
  );
  const svg = document.querySelector("#content svg");
  if (!svg) {
    return;
  }
  svg.addEventListener("pointerdown", (e: PointerEvent) => (pointerStart = { x: e.clientX, y: e.clientY }));
  svg.querySelectorAll<SVGGElement>("g.node").forEach((node) => {
    // Mermaid 12 ids: `<render id>-classId-<id>-<n>` (class diagrams),
    // `<render id>-flowchart-<id>-<n>` (flowcharts).
    const id = /-(?:classId|flowchart)-(.+)-\d+$/.exec(node.id)?.[1];
    if (!id) {
      return;
    }
    const tooltip = state.tooltips?.[id];
    if (tooltip) {
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = tooltip;
      node.prepend(title);
    }
    node.addEventListener("click", (e: MouseEvent) => {
      const moved = pointerStart ? Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) : 0;
      if (moved > 4) {
        return; // that was a pan
      }
      node.classList.add("clicked");
      setStepping(true);
      api?.postMessage({ command: "nodeClick", id });
    });
  });
}

// ---------------------------------------------------------------------------
// Orientation between steps: transitions and the two anchors ("here", "came from").

interface Transition {
  kind: "start" | "extend" | "descend" | "ascend" | "jump";
  level: string;
  focus?: string;
  from?: string;
}

interface Scene {
  /** Screen centre of each box, by explorer id. */
  centres: Map<string, { x: number; y: number }>;
  /** Screen pixels per diagram unit. */
  scale: number;
  /** A frozen copy of the old picture, for zooming out of it. */
  clone?: HTMLElement;
  /** Screen centre of the box that was clicked, if any. */
  clicked?: { x: number; y: number };
}

const ANCHOR_STYLE = `
#explorer-level { font: 600 10px system-ui, sans-serif; letter-spacing: .08em; color: var(--on-accent); background: var(--accent);
  border-radius: 4px; padding: 3px 7px; margin-left: 6px; }
#explorer-level.flash { animation: levelflash 1.2s ease-out; }
@keyframes levelflash { 0% { transform: scale(1.35); box-shadow: 0 0 0 6px var(--accent-soft); } 100% { transform: none; box-shadow: none; } }
#explorer-ghost { position: fixed; z-index: 20; pointer-events: none; transition: transform .45s cubic-bezier(.4,0,.2,1), opacity .45s ease; }
#content svg.entering { animation: none !important; transition: transform .45s cubic-bezier(.2,0,.2,1), opacity .45s ease; }
#content svg.morphing .edgePaths, #content svg.morphing .edgeLabels, #content svg.morphing .edges, #content svg.morphing g.cluster,
#content svg.morphing path.relation, #content svg.morphing .edgeTerminals { opacity: 0; }
#content svg .edgePaths, #content svg .edgeLabels, #content svg .edges, #content svg g.cluster, #content svg path.relation, #content svg .edgeTerminals
  { transition: opacity .35s ease .1s; }
#content svg.morphing { animation: none !important; }
#content g.node.arrived { animation: arrived 1.8s ease-out; }
@keyframes arrived { 0%, 30% { filter: drop-shadow(0 0 7px var(--green)); } 100% { filter: none; } }
#content svg .anchor-ring { fill: none !important; pointer-events: none; }
#content svg .anchor-tag { pointer-events: none; }
#content svg .anchor-ring.here { stroke: var(--accent) !important; stroke-width: 3.5px !important; }
#content svg .anchor-ring.from { stroke: var(--amber) !important; stroke-width: 3px !important; stroke-dasharray: 7 4 !important; }
#content .anchor-tag rect { rx: 4; }
#content svg .anchor-tag.here rect { fill: var(--accent) !important; stroke: none !important; }
#content svg .anchor-tag.from rect { fill: var(--amber) !important; stroke: none !important; }
#content svg .anchor-tag text { fill: var(--on-accent) !important; font: 600 11px system-ui, sans-serif; letter-spacing: .04em; }
#content svg .anchor-tag.from text { fill: var(--on-amber) !important; }
#content .anchor-ring.here.pulse { animation: ringpulse 1.6s ease-out 2; }
@keyframes ringpulse { 0% { stroke-opacity: .2; } 50% { stroke-opacity: 1; } 75% { stroke-opacity: .5; } 100% { stroke-opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  #explorer-ghost, #content svg.entering { transition: none; }
  #explorer-level.flash, #content g.node.arrived, #content .anchor-ring.here.pulse { animation: none; }
}
`;

let anchorStyled = false;
let lastLevel = "";

const nodeId = (node: Element) => /-(?:classId|flowchart)-(.+)-\d+$/.exec(node.id)?.[1];

function boxes(svg: Element): Map<string, SVGGElement> {
  const out = new Map<string, SVGGElement>();
  svg.querySelectorAll<SVGGElement>("g.node").forEach((node) => {
    const id = nodeId(node);
    if (id && !out.has(id)) {
      out.set(id, node);
    }
  });
  return out;
}

const centreOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Before a step renders: where every box is now, and a frozen copy of the picture. */
export function captureScene(panZoom: any): Scene | undefined {
  const svg = document.querySelector("#content svg");
  if (!active || !svg) {
    return undefined;
  }
  const centres = new Map<string, { x: number; y: number }>();
  boxes(svg).forEach((node, id) => centres.set(id, centreOf(node)));
  const clickedNode = svg.querySelector("g.node.clicked");
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGElement;
  const ghost = document.createElement("div");
  ghost.id = "explorer-ghost";
  Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  clone.style.width = "100%";
  clone.style.height = "100%";
  ghost.appendChild(clone);
  let scale = 1;
  try {
    scale = panZoom?.getSizes?.().realZoom ?? 1;
  } catch {
    // keep 1
  }
  return { centres, scale, clone: ghost, clicked: clickedNode ? centreOf(clickedNode) : undefined };
}

/** Parses a `translate(x, y)` transform attribute. */
function translateOf(node: SVGGElement): { x: number; y: number } | undefined {
  const m = /translate\(\s*(-?[\d.e+-]+)[ ,]+(-?[\d.e+-]+)\s*\)/.exec(node.getAttribute("transform") ?? "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** After a step renders: keep the viewer oriented, then mark "here" and "came from". Resolves when the motion has finished. */
export async function playTransition(scene: Scene | undefined, transition: Transition | undefined, panZoom: any): Promise<void> {
  if (!active) {
    return;
  }
  if (!anchorStyled) {
    anchorStyled = true;
    const style = document.createElement("style");
    style.textContent = ANCHOR_STYLE;
    document.head.appendChild(style);
    document.querySelector("#explorer-toolbar .title")?.insertAdjacentHTML("beforebegin", `<span id="explorer-level"></span>`);
  }
  const svg = document.querySelector<SVGSVGElement>("#content svg");
  if (!svg) {
    return;
  }
  const kind = transition?.kind ?? "start";

  // The level badge: flashes when the level changes.
  const badge = document.getElementById("explorer-level");
  if (badge && transition?.level) {
    badge.textContent = transition.level.toUpperCase();
    if (lastLevel && lastLevel !== transition.level) {
      badge.classList.remove("flash");
      void badge.offsetWidth;
      badge.classList.add("flash");
    }
    lastLevel = transition.level;
  }

  const motion = !reducedMotion();
  markAnchors(svg, transition);
  if (kind === "extend" && scene) {
    await morph(svg, scene, transition!, panZoom, motion);
  } else if ((kind === "descend" || kind === "ascend" || kind === "jump") && scene?.clone && motion) {
    await zoom(svg, scene, kind);
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Same scene grown: keep the scale and the box we stand on in place, then glide every box from its old position. */
async function morph(svg: SVGSVGElement, scene: Scene, transition: Transition, panZoom: any, motion: boolean) {
  // svg-pan-zoom applies zoom and pan on the next frame: hide the picture while it settles.
  svg.style.visibility = "hidden";
  try {
    const sizes = panZoom.getSizes();
    const fitReal = sizes.realZoom / panZoom.getZoom();
    const bbox = sizes.viewBox;
    const fits = Math.min(sizes.width / bbox.width, sizes.height / bbox.height);
    // The old scale, unless the grown picture would then overflow the panel by far.
    const real = Math.min(scene.scale, Math.max(fits * 0.95, scene.scale * 0.6));
    panZoom.zoom(real / fitReal);
  } catch {
    // keep the fitted zoom
  }
  await nextFrame();
  const now = boxes(svg);
  const pin = [transition.from, transition.focus].find((id) => id && scene.centres.has(id) && now.has(id))
    ?? [...now.keys()].find((id) => scene.centres.has(id));
  let shift = { x: 0, y: 0 };
  if (pin) {
    const before = scene.centres.get(pin)!;
    const after = centreOf(now.get(pin)!);
    shift = { x: before.x - after.x, y: before.y - after.y };
  }
  // The clicked box must be in view: nudge the picture just enough.
  const focus = transition.focus ? now.get(transition.focus) : undefined;
  if (focus) {
    const r = focus.getBoundingClientRect();
    const left = r.left + shift.x;
    const right = r.right + shift.x;
    const top = r.top + shift.y;
    const bottom = r.bottom + shift.y;
    const minTop = 64;
    const margin = 24;
    shift.x += left < margin ? margin - left : right > innerWidth - margin ? Math.max(innerWidth - margin - right, margin - left) : 0;
    shift.y += top < minTop ? minTop - top : bottom > innerHeight - margin ? Math.max(innerHeight - margin - bottom, minTop - top) : 0;
  }
  if (shift.x || shift.y) {
    panZoom.panBy(shift);
    await nextFrame();
  }
  const arrived: SVGGElement[] = [];
  const moving: { node: SVGGElement; to: { x: number; y: number }; dx: number; dy: number }[] = [];
  now.forEach((node, id) => {
    const before = scene.centres.get(id);
    if (!before) {
      arrived.push(node);
      return;
    }
    const to = translateOf(node);
    const ctm = (node.parentNode as SVGGraphicsElement).getScreenCTM?.();
    if (!to || !ctm || !motion) {
      return;
    }
    const after = centreOf(node);
    moving.push({ node, to, dx: (before.x - after.x) / ctm.a, dy: (before.y - after.y) / ctm.d });
  });
  arrived.forEach((node) => node.classList.add("arrived"));
  if (moving.length) {
    svg.classList.add("morphing");
    for (const m of moving) {
      m.node.setAttribute("transform", `translate(${m.to.x + m.dx}, ${m.to.y + m.dy})`);
    }
  }
  svg.style.visibility = "";
  if (!moving.length) {
    return;
  }
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const start = performance.now();
  const duration = 600;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const frame = (time: number) => {
    const t = Math.min(1, (time - start) / duration);
    const k = 1 - ease(t);
    for (const m of moving) {
      m.node.setAttribute("transform", `translate(${m.to.x + m.dx * k}, ${m.to.y + m.dy * k})`);
    }
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      svg.classList.remove("morphing");
      done();
    }
  };
  requestAnimationFrame(frame);
  return finished;
}

/** Another level: the old picture zooms into the clicked box (deeper) or away (higher); the new one arrives. */
function zoom(svg: SVGSVGElement, scene: Scene, kind: Transition["kind"]): Promise<void> {
  const ghost = scene.clone!;
  document.body.appendChild(ghost);
  const r = ghost.getBoundingClientRect();
  const origin = kind === "descend" && scene.clicked ? scene.clicked : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  ghost.style.transformOrigin = `${origin.x - r.left}px ${origin.y - r.top}px`;
  svg.classList.add("entering");
  svg.style.transformOrigin = kind === "descend" && scene.clicked ? `${origin.x - r.left}px ${origin.y - r.top}px` : "50% 50%";
  svg.style.transform = kind === "descend" ? "scale(.55)" : kind === "ascend" ? "scale(1.5)" : "scale(.97)";
  svg.style.opacity = "0";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ghost.style.transform = kind === "descend" ? "scale(2.6)" : kind === "ascend" ? "scale(.45)" : "none";
      ghost.style.opacity = "0";
      svg.style.transform = "none";
      svg.style.opacity = "1";
    })
  );
  return new Promise((resolve) =>
    setTimeout(() => {
      ghost.remove();
      svg.classList.remove("entering");
      svg.style.transform = "";
      svg.style.opacity = "";
      resolve();
    }, 520)
  );
}

/** A ring and a label on a box, drawn in the box's own coordinates so they move with it. */
function markAnchors(svg: SVGSVGElement, transition: Transition | undefined) {
  const now = boxes(svg);
  const mark = (id: string | undefined, kind: "here" | "from", label: string) => {
    const node = id ? now.get(id) : undefined;
    if (!node) {
      return;
    }
    let box: DOMRect;
    try {
      box = node.getBBox();
    } catch {
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    const pad = 5;
    const ring = document.createElementNS(ns, "rect");
    ring.setAttribute("class", `anchor-ring ${kind}${kind === "here" ? " pulse" : ""}`);
    ring.setAttribute("x", String(box.x - pad));
    ring.setAttribute("y", String(box.y - pad));
    ring.setAttribute("width", String(box.width + 2 * pad));
    ring.setAttribute("height", String(box.height + 2 * pad));
    ring.setAttribute("rx", "6");
    const tag = document.createElementNS(ns, "g");
    tag.setAttribute("class", `anchor-tag ${kind}`);
    const text = document.createElementNS(ns, "text");
    text.textContent = label;
    const width = label.length * 6.2 + 12;
    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("x", String(box.x - pad));
    bg.setAttribute("y", String(box.y - pad - 17));
    bg.setAttribute("width", String(width));
    bg.setAttribute("height", "15");
    text.setAttribute("x", String(box.x - pad + 6));
    text.setAttribute("y", String(box.y - pad - 6));
    tag.append(bg, text);
    // The ring behind the box's own shapes; the label on top.
    node.insertBefore(ring, node.firstChild);
    node.append(tag);
    try {
      bg.setAttribute("width", String(text.getComputedTextLength() + 12));
    } catch {
      // keep the estimate
    }
  };
  mark(transition?.from, "from", "CAME FROM");
  mark(transition?.focus, "here", "YOU CLICKED");
}
