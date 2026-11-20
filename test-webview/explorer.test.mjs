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
async function openPanel(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, ...options });
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
  await send(page, { command: "explorerMode", title: "Code Explorer" });
  return { page, errors };
}

const send = (page, message) => page.evaluate((m) => window.postMessage(m, "*"), message);

/** Render a step and wait until its transition has finished and the anchors are placed. */
async function step(page, content, transition, extra = {}) {
  await page.evaluate(() => document.querySelector("#content svg")?.setAttribute("data-old", "1"));
  await send(page, { command: "renderContent", content, transition, canGoBack: true, crumbs: ["acme", "here"], ...extra });
  await page.waitForFunction(
    () => {
      const svg = document.querySelector("#content svg");
      return svg && !svg.hasAttribute("data-old") && !svg.classList.contains("morphing") && !svg.classList.contains("entering")
        && getComputedStyle(svg).visibility !== "hidden";
    },
    undefined,
    { timeout: 15000 },
  );
  await page.waitForTimeout(900); // the glide and zoom run up to ~700 ms after the classes clear
}

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
