// Runs checks against the site as shipped (The Descent host + game) using the FriendSDK's own
// read-only test fixture: a mock wallet, mock Robinhood RPC answers and recorded sample artwork.
// Mocks exist only in this automated browser; published builds keep the real ownership gate.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createGameServer } from "@rarefriends/friendsdk/serve";
import { installFixture, createArtworkFixture, assertBounds } from "../node_modules/@rarefriends/friendsdk/scripts/browser-fixture.mjs";
import { buildSite } from "./site.mjs";

let built = null;
async function site() {
  if (!built) { const dir = await mkdtemp(join(tmpdir(), "descent-site-")); built = { dir, outdir: await buildSite(join(dir, "site")) }; }
  return built.outdir;
}
export async function cleanup() { if (built) await rm(built.dir, { recursive: true, force: true }); built = null; }

/**
 * `video` ({ dir }) records the page at viewport size; check receives `pageCreatedAt` (ms) to line clips up with the recording.
 * `init` ({ script, arg }) runs in every frame before its own scripts (used by the deterministic golden-frame replay).
 */
export async function testSite({ width = 960, height = 800, timeout = 30000, picker, check, video, reducedMotion = "reduce", init }) {
  const outdir = await site();
  const server = createGameServer(outdir);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, reducedMotion,
      ...(video ? { recordVideo: { dir: video.dir, size: { width, height } } } : {}) });
    const page = await context.newPage();
    const pageCreatedAt = Date.now();
    if (init) await page.addInitScript(init.script, init.arg);
    page.setDefaultTimeout(timeout);
    page.on("pageerror", error => errors.push(error.message));
    const fixture = await installFixture(page, origin, { artworkCall: await createArtworkFixture() });
    await page.goto(origin);
    await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
    await page.getByRole("button", { name: /^Friend #7730\b/ }).waitFor();
    if (picker) await picker({ page });
    await page.getByRole("button", { name: /^Friend #7730\b/ }).click();
    const game = page.frameLocator("iframe");
    await game.locator("#root > *").first().waitFor();
    await game.getByText("Waiting for your Friend…", { exact: true }).waitFor({ state: "hidden" });
    assert(fixture.ownerReads >= 1, "the SDK gate must freshly read ownership");
    assert.equal(await page.locator("iframe").getAttribute("sandbox"), "allow-scripts");
    await assertBounds(page);
    await check({ page, game, fixture, pageCreatedAt });
    assert.deepEqual([...errors, ...fixture.errors], [], "browser errors");
    assert((await page.evaluate(() => window.__friendWalletTest.state.requests)).every(method =>
      ["eth_accounts", "eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain"].includes(method)), "no signing requests");
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
}
