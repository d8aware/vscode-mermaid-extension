/**
 * The explorer panel in a real browser: the built webview (dist/, `npm run build`)
 * driven with the messages the extension sends, checking what the viewer sees:
 * the level badge, the "you clicked" and "came from" rings, the clicked box kept
 * on screen, and clicks posted back. Run with `npm run test:webview`.
 *
 * Uses Playwright's Chromium when installed, else the system Chrome (CI).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const golden = (rel) => fs.readFileSync(path.join(ROOT, "test-files", rel), "utf8");

let server, browser, base;

before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, "bundle.js")), "build the webview first: npm run build");
  server = http.createServer((req, res) => {
    const file = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** A panel page with the VS Code API stubbed: posted messages are collected in window.posted. */
async function openPanel(options = {}, theme) {
  const { preview, ...pageOptions } = options;
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, ...pageOptions });
  if (theme) {
    // What VS Code gives a webview: the theme's colours as --vscode-* variables, its kind on <body>;
    // and what the extension writes: the diagramColors setting.
    await page.addInitScript((t) => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState !== "interactive") {
          return;
        }
        for (const [k, v] of Object.entries(t.vars)) {
          document.documentElement.style.setProperty(`--vscode-${k}`, v);
        }
        document.body.dataset.vscodeThemeKind = t.kind;
        document.body.dataset.colors = t.colors ?? "editor";
      });
    }, theme);
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // A failed load is reported by URL (below); the browser's own favicon request is not the panel's.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && errors.push(`${r.status()} ${r.url()}`));
  await page.addInitScript(() => {
    window.posted = [];
    window.acquireVsCodeApi = () => ({ postMessage: (m) => window.posted.push(m) });
  });
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => window.posted.some((m) => m.command === "ready"));
  if (!options.preview) {
    await send(page, { command: "explorerMode", title: "Code Explorer" });
  }
  return { page, errors };
}

const send = (page, message) => page.evaluate((m) => window.postMessage(m, "*"), message);

const shown = (page) => page.evaluate(() => Number(document.body.dataset.shown ?? 0));

/** Send a message that draws, and wait until the panel says the drawing (and its motion) has finished. */
async function drawn(page, message) {
  const before = await shown(page);
  await send(page, message);
  await page.waitForFunction((n) => Number(document.body.dataset.shown ?? 0) > n, before, { timeout: 20000 });
}

/** Render a step and wait until its transition has finished and the anchors are placed. */
const step = (page, content, transition, extra = {}) =>
  drawn(page, { command: "renderContent", content, transition, canGoBack: true, crumbs: ["acme", "here"], ...extra });

/** The ring of one kind and the id of the box it sits in. */
const ring = (page, kind) =>
  page.evaluate((kind) => {
    const rings = [...document.querySelectorAll(`#content svg .anchor-ring.${kind}`)];
    const tags = [...document.querySelectorAll(`#content svg .anchor-tag.${kind} text`)];
    return rings.map((r, i) => ({
      box: /-(?:classId|flowchart)-(.+)-\d+$/.exec(r.closest("g.node").id)?.[1],
      label: tags[i]?.textContent,
      // The ring must be drawn: no fill hiding the box, a visible stroke.
      fill: getComputedStyle(r).fill,
      stroke: getComputedStyle(r).stroke,
    }));
  }, kind);

const badge = (page) => page.evaluate(() => document.getElementById("explorer-level")?.textContent);

/** The box's rectangle against the visible panel area. */
const onScreen = (page, id) =>
  page.evaluate((id) => {
    const node = [...document.querySelectorAll("#content g.node")].find((n) => new RegExp(`-(?:classId|flowchart)-${id}-\\d+$`).test(n.id));
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }, id);

const ORDER = golden("explorer/ts-orders.views/expected-1-order.mmd");
const ORDER_STORE = golden("explorer/ts-orders.views/expected-2-order-Store.mmd");
const PROJECTS = golden("landscape/acme.views/expected.mmd");
const WEB = golden("landscape/acme.views/expected-project-web.mmd");

test("a class view grows: rings on the clicked box and the one you came from, both kept on screen", async () => {
  const { page, errors } = await openPanel();
  await step(page, ORDER, { kind: "start", level: "Classes" });
  assert.equal(await badge(page), "CLASSES");
  assert.deepEqual(await ring(page, "here"), [], "no rings on the first view");

  await step(page, ORDER_STORE, { kind: "extend", level: "Classes", focus: "Store", from: "Order" });
  const [here] = await ring(page, "here");
  const [from] = await ring(page, "from");
  assert.equal(here?.box, "Store");
  assert.equal(here.label, "YOU CLICKED");
  assert.equal(from?.box, "Order");
  assert.equal(from.label, "CAME FROM");
  for (const r of [here, from]) {
    assert.equal(r.fill, "none", "the ring does not cover the box");
    assert.notEqual(r.stroke, "none");
  }
  assert.ok(await onScreen(page, "Store"), "the clicked box is on screen");
  assert.ok(await onScreen(page, "Order"), "the box you came from is on screen");
  assert.deepEqual(errors, []);
  await page.close();
});

test("levels: the badge follows, going back up rings the box you came from", async () => {
  const { page, errors } = await openPanel();
  await step(page, PROJECTS, { kind: "start", level: "Projects" });
  assert.equal(await badge(page), "PROJECTS");
  await step(page, WEB, { kind: "descend", level: "Code" });
  assert.equal(await badge(page), "CODE");
  await step(page, PROJECTS, { kind: "ascend", level: "Projects", from: "p_web" });
  assert.equal(await badge(page), "PROJECTS");
  assert.deepEqual((await ring(page, "from")).map((r) => r.box), ["p_web"]);
  assert.deepEqual(await ring(page, "here"), []);
  assert.ok(await onScreen(page, "p_web"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("reduced motion: no animation, the rings and badge still appear", async () => {
  const { page, errors } = await openPanel({ reducedMotion: "reduce" });
  await step(page, ORDER, { kind: "start", level: "Classes" });
  await step(page, ORDER_STORE, { kind: "extend", level: "Classes", focus: "Store", from: "Order" });
  assert.equal(await page.evaluate(() => document.querySelectorAll("#content g.node.arrived").length > 0 ? getComputedStyle(document.querySelector("#content g.node.arrived")).animationName : "none"), "none");
  assert.equal((await ring(page, "here"))[0]?.box, "Store");
  assert.equal((await ring(page, "from"))[0]?.box, "Order");
  assert.equal(await badge(page), "CLASSES");
  assert.deepEqual(errors, []);
  await page.close();
});

test("clicks are posted back: a box, a breadcrumb, the toolbar; a drag is not a click", async () => {
  const { page, errors } = await openPanel();
  await step(page, ORDER, { kind: "start", level: "Classes" }, { tooltips: { Store: "uses: Order.store" } });
  const posted = () => page.evaluate(() => window.posted.filter((m) => m.command !== "ready"));
  const store = page.locator("#content g.node[id*='-classId-Store-']");
  assert.equal(await store.locator("title").first().textContent(), "uses: Order.store", "the tooltip is the rule");

  await store.click();
  assert.deepEqual(await posted(), [{ command: "nodeClick", id: "Store" }]);
  assert.ok(await store.evaluate((n) => n.classList.contains("clicked")));

  await page.locator("#explorer-toolbar .crumb").first().click();
  await page.locator('#explorer-toolbar [data-action="back"]').click();
  assert.deepEqual((await posted()).slice(1), [{ command: "crumb", index: 0 }, { command: "back" }]);

  // A drag that starts and ends on a box pans; it must not explore.
  const box = await page.locator("#content g.node[id*='-classId-Money-']").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  assert.equal((await posted()).filter((m) => m.command === "nodeClick").length, 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test("nothing to show: standing down closes the loading scene", async () => {
  const { page, errors } = await openPanel();
  await step(page, ORDER, { kind: "start", level: "Classes" });
  await send(page, { command: "analysisProgress", label: "Mapping classes in acme…", done: 3, total: 3, file: "constants.ts" });
  assert.equal(await page.evaluate(() => document.getElementById("explorer-overlay").classList.contains("done")), false, "loading");
  await send(page, { command: "explorerSettle", canGoBack: false });
  await page.waitForFunction(() => document.getElementById("explorer-overlay").classList.contains("done"), undefined, { timeout: 3000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById("explorer-overlay")).opacity === "0", undefined, { timeout: 3000 });
  assert.deepEqual(errors, []);
  await page.close();
});

// ---------------------------------------------------------------------------
// Colours: diagramColors "editor" draws in the VS Code theme's colours.

const BLUE = {
  kind: "vscode-dark",
  vars: {
    "editor-background": "#002451", "editor-foreground": "#ffffff", "editorWidget-background": "#001c40", focusBorder: "#bbdaff",
    descriptionForeground: "#ccccccb3", "charts-red": "#f14c4c", "charts-green": "#89d185", "charts-orange": "#d18616",
  },
};
// A theme that makes poor choices: its focus colour is its background, its widgets its text colour.
const CARELESS = {
  kind: "vscode-dark",
  vars: { "editor-background": "#1e1e1e", "editor-foreground": "#d4d4d4", "editorWidget-background": "#d4d4d4", focusBorder: "#1e1e1e", "charts-orange": "#202020" },
};

/** WCAG contrast of two computed CSS colours. */
const contrastOf = (page, a, b) =>
  page.evaluate(([a, b]) => {
    const lum = (c) => {
      const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => x / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }, [a, b]);

/** Fill of a box's shape and colour of its label, as computed. */
const boxColors = (page, id) =>
  page.evaluate((id) => {
    const node = [...document.querySelectorAll("#content g.node")].find((n) => new RegExp(`-(?:classId|flowchart)-${id}-\\d+$`).test(n.id));
    // Mermaid may draw a box as an outline and a fill: the first shape that is filled.
    const shape = [...node.querySelectorAll("rect, path, polygon")].find((e) => getComputedStyle(e).fill !== "none");
    const label = node.querySelector(".nodeLabel, span, text, p");
    return { fill: getComputedStyle(shape).fill, text: getComputedStyle(label).color, page: getComputedStyle(document.body).backgroundColor };
  }, id);

test("colours follow the VS Code theme: dark boxes, readable labels, the panel too", async () => {
  const { page, errors } = await openPanel({}, BLUE);
  await step(page, WEB, { kind: "start", level: "Code" });
  const box = await boxColors(page, "n_src_app");
  assert.equal(box.page, "rgb(0, 36, 81)", "the page is the editor background");
  assert.ok(await contrastOf(page, box.text, box.fill) >= 4.5, `label ${box.text} on ${box.fill}`);
  const entry = await boxColors(page, "n_src_main_ts");
  assert.notEqual(entry.fill, "rgb(240, 253, 244)", "the light entry colour is replaced");
  assert.ok(await contrastOf(page, entry.text, entry.fill) >= 4.5);
  const toolbar = await page.evaluate(() => {
    const b = document.querySelector("#explorer-toolbar button");
    return { fill: getComputedStyle(b).backgroundColor, text: getComputedStyle(b).color };
  });
  assert.ok(await contrastOf(page, toolbar.text, toolbar.fill) >= 4.5, "toolbar buttons readable");
  assert.deepEqual(errors, []);
  await page.close();
});

test("any theme stays readable: poor theme choices fall back to the theme's text and background", async () => {
  const { page, errors } = await openPanel({}, CARELESS);
  await step(page, ORDER, { kind: "start", level: "Classes" });
  await step(page, ORDER_STORE, { kind: "extend", level: "Classes", focus: "Store", from: "Order" });
  const box = await boxColors(page, "Order");
  assert.ok(await contrastOf(page, box.text, box.fill) >= 4.5, `label ${box.text} on ${box.fill}`);
  const marks = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    badge: getComputedStyle(document.getElementById("explorer-level")).backgroundColor,
    badgeText: getComputedStyle(document.getElementById("explorer-level")).color,
    ring: getComputedStyle(document.querySelector("#content .anchor-ring.from")).stroke,
  }));
  assert.ok(await contrastOf(page, marks.badge, marks.page) >= 3, "the badge stands out from the page");
  assert.ok(await contrastOf(page, marks.badgeText, marks.badge) >= 4.5, "badge text readable");
  assert.ok(await contrastOf(page, marks.ring, marks.page) >= 3, "the came-from ring stands out");
  assert.deepEqual(errors, []);
  await page.close();
});

test("light (the default) keeps the diagrams' own colours", async () => {
  const { page } = await openPanel({}, { ...BLUE, colors: "light" });
  await step(page, WEB, { kind: "start", level: "Code" });
  assert.equal((await boxColors(page, "n_src_app")).fill, "rgb(255, 255, 255)");
  await page.close();
});

test("switching the setting redraws in place; a diagram's own theme wins in previews", async () => {
  const { page, errors } = await openPanel({}, { ...BLUE, colors: "light" });
  await step(page, WEB, { kind: "start", level: "Code" });
  await drawn(page, { command: "colors", mode: "editor" });
  assert.notEqual((await boxColors(page, "n_src_app")).fill, "rgb(255, 255, 255)", "redrawn in the theme's colours");
  await page.close();

  const preview = await openPanel({ preview: true }, BLUE);
  const own = '%%{init: {"theme": "forest"}}%%\nflowchart LR\n  A --> B\n';
  const fillOfA = () => preview.page.evaluate(() => {
    const node = [...document.querySelectorAll("#content g.node")].find((n) => /-flowchart-A-\d+$/.test(n.id));
    const shape = node && [...node.querySelectorAll("rect, path, polygon")].find((e) => getComputedStyle(e).fill !== "none");
    return shape ? getComputedStyle(shape).fill : undefined;
  });
  await drawn(preview.page, { command: "renderContent", content: own });
  assert.equal(await fillOfA(), "rgb(205, 228, 152)", "forest's own box colour");
  const plain = "flowchart LR\n  A --> B\n";
  await drawn(preview.page, { command: "renderContent", content: plain });
  const themed = await boxColors(preview.page, "A");
  assert.ok(await contrastOf(preview.page, themed.text, themed.fill) >= 4.5);
  assert.notEqual(themed.fill, "rgb(236, 236, 255)", "not Mermaid's light default");
  assert.deepEqual([...errors, ...preview.errors], []);
  await preview.page.close();
});

