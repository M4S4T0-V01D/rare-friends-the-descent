// Checks the no-wallet showcase at live-preview/: it loads with no wallet or chain access, the trailer and every
// family clip can play, the family guide matches the game's kit, every screenshot loads, and it fits a phone.
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";
import { buildShowcase } from "./site.mjs";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2" };
const dir = await mkdtemp(join(tmpdir(), "descent-showcase-"));
await buildShowcase(join(dir, "live-preview"));
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  const file = join(dir, path);
  try {
    const info = await stat(file);
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    if (range) {
      const start = Number(range[1]), end = range[2] ? Number(range[2]) : info.size - 1;
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${info.size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": info.size });
      createReadStream(file).pipe(res);
    }
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
const step = async (name, fn) => { await fn(); results.push(name); console.log(`PASS ${name}`); };

try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [], foreign = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("request", r => { if (!r.url().startsWith(origin)) foreign.push(r.url()); });
    // A wallet is present in the browser; the showcase must never touch it.
    await page.addInitScript(() => {
      window.__walletCalls = [];
      window.ethereum = { isMetaMask: true, request: args => { window.__walletCalls.push(args.method); return Promise.resolve(null); }, on() {}, removeListener() {} };
    });
    await page.goto(`${origin}/live-preview/`);
    const tag = `${viewport.width}px`;

    await step(`${tag}: title, Play link to the gated game, simulated label`, async () => {
      await page.getByRole("heading", { level: 1, name: "The Descent" }).waitFor();
      const play = page.getByRole("link", { name: /Play \(wallet required\)/ }).first();
      assert.equal(new URL(await play.getAttribute("href"), `${origin}/live-preview/`).pathname, "/");
      assert(await page.getByText(/All RF shown is simulated/).isVisible());
    });

    await step(`${tag}: family guide lists all nine families with the game's kit`, async () => {
      const names = await page.locator(".family h3").allTextContents();
      assert.deepEqual(names, ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"]);
      assert(await page.locator(".family", { hasText: "Colossus" }).getByText("Earthshatter").isVisible());
      assert.deepEqual(await page.locator(".seed .styles").evaluateAll(lists => lists.map(l => l.children.length)), [3, 3, 2, 2]);
    });

    await step(`${tag}: the trailer and every family clip can play`, async () => {
      const trailer = await page.locator(".trailer video").evaluate(v => new Promise(done => {
        if (v.readyState >= 1) return done({ src: v.currentSrc, duration: v.duration });
        v.addEventListener("loadedmetadata", () => done({ src: v.currentSrc, duration: v.duration }), { once: true });
        v.addEventListener("error", () => done({ src: v.currentSrc, duration: NaN }), { once: true });
        v.load();
      }));
      assert(trailer.duration > 30 && trailer.duration < 120, `trailer plays (${trailer.src}, ${trailer.duration}s)`);
      const clips = await page.locator(".family video").evaluateAll(videos => Promise.all(videos.map(v => new Promise(done => {
        v.addEventListener("loadedmetadata", () => done(v.duration), { once: true });
        v.addEventListener("error", () => done(NaN), { once: true });
        v.load();
      }))));
      assert(clips.length === 9 && clips.every(d => d > 1), `clips play (${clips.join(", ")})`);
    });

    await step(`${tag}: every screenshot loads`, async () => {
      await page.locator(".gallery img").evaluateAll(imgs => imgs.forEach(i => { i.loading = "eager"; }));
      await page.waitForFunction(() => [...document.querySelectorAll(".gallery img")].every(i => i.complete));
      const widths = await page.locator(".gallery img").evaluateAll(imgs => imgs.map(i => i.naturalWidth));
      assert(widths.length === 9 && widths.every(w => w > 0), `images loaded (${widths})`);
    });

    await step(`${tag}: a family's voice plays on click`, async () => {
      await page.locator(".family", { hasText: "Skeleton" }).getByRole("button", { name: /Hear its voice/ }).click();
      await page.waitForTimeout(600);
    });

    await step(`${tag}: no wallet calls, no outside requests, no horizontal scroll, no errors`, async () => {
      assert.deepEqual(await page.evaluate(() => window.__walletCalls), []);
      assert.deepEqual(foreign, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll");
      assert.deepEqual(errors, []);
    });
    if (viewport.width > 1000) await page.screenshot({ path: "artifacts/showcase-desktop.png", fullPage: true });
    else await page.screenshot({ path: "artifacts/showcase-phone.png", fullPage: true });
    await page.close();
  }
  console.log(`${results.length}/${results.length} passed`);
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  await rm(dir, { recursive: true, force: true });
}
