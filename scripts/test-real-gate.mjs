// Live ownership-gate check against Robinhood mainnet (chain 4663), read-only.
// A stand-in browser wallet reports an account and chain and refuses every signing method, so no
// transaction can ever be requested. All ownership, generation and artwork reads hit the real public RPC.
// Usage: npm run build && MY_WALLET=0xYourOwnAddress node scripts/test-real-gate.mjs
// It never looks up anyone else's wallet or scans the collection: the holder scenario uses only the address you pass
// in MY_WALLET (your own), and discovery goes through the SDK's owner-filtered picker exactly as in play.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createGameServer } from "@rarefriends/friendsdk/serve";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const OUT = "artifacts/real-gate";
await mkdir(OUT, { recursive: true });
const holder = /^0x[0-9a-fA-F]{40}$/.test(process.env.MY_WALLET ?? "") ? process.env.MY_WALLET : null;
if (!holder) console.log("MY_WALLET not set: skipping the holder scenario (set it to your own address to run it).");

// Set TARGET_URL to check a published preview (for example the GitHub Pages site) instead of ./site.
const target = process.env.TARGET_URL;
const server = target ? null : createGameServer("./site");
if (server) await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const pageUrl = target ?? `http://127.0.0.1:${server.address().port}/`;
const origin = new URL(pageUrl).origin;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];

async function scenario(name, { account, chainId }, check) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 780 } });
  await context.addInitScript(({ account, chainId }) => {
    const listeners = new Map();
    const requests = [];
    window.__readOnlyWallet = { requests };
    window.ethereum = {
      isReadOnlyTestWallet: true,
      async request({ method }) {
        requests.push(method);
        if (method === "eth_accounts") return window.__connected ? [account] : [];
        if (method === "eth_requestAccounts") { window.__connected = true; return [account]; }
        if (method === "eth_chainId") return chainId;
        throw Object.assign(new Error(`Read-only test wallet refuses ${method}`), { code: 4200 });
      },
      on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
      removeListener(event, listener) { listeners.get(event)?.delete(listener); },
    };
  }, { account, chainId });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.origin === RPC || ["blob:", "data:"].includes(url.protocol)) return route.continue();
    errors.push(`blocked external request ${url.href}`);
    return route.abort();
  });
  try {
    await page.goto(pageUrl);
    await check(page);
    const methods = await page.evaluate(() => window.__readOnlyWallet.requests);
    assert(methods.every(m => ["eth_accounts", "eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain"].includes(m)), `wallet methods: ${methods}`);
    assert.deepEqual(errors, []);
    results.push(`PASS ${name}`);
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/${name.replace(/\W+/g, "-")}-failure.png` });
  } finally {
    await context.close();
  }
}

if (holder) await scenario("your own wallet passes the gate and plays with on-chain artwork", { account: holder, chainId: "0x1237" }, async page => {
  await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
  const friend = page.getByRole("button", { name: /^Friend #\d+\b/ }).first();
  // The public RPC can reject bursts; the SDK picker offers a retry, which a player would press.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const retry = page.getByRole("button", { name: "Retry loading Friends" });
    await Promise.race([friend.waitFor({ timeout: 60000 }), retry.waitFor({ timeout: 60000 })]);
    if (await friend.isVisible()) break;
    console.log(`  discovery attempt ${attempt} hit an RPC error; retrying`);
    await page.waitForTimeout(3000 * attempt);
    await retry.click();
  }
  await friend.waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${OUT}/01-picker.png` });
  await friend.click();
  const game = page.frameLocator("iframe");
  await game.getByRole("button", { name: /Begin/ }).waitFor({ timeout: 60000 });
  await game.getByText(/verified hardwired Generations NFT/).waitFor();
  await page.screenshot({ path: `${OUT}/02-title-real-art.png` });
  await game.getByRole("button", { name: /Begin/ }).click();
  await game.getByRole("button", { name: /Descend/ }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/03-dungeon-real-art.png` });
});

await scenario("an account without Generations NFTs cannot play", { account: "0x000000000000000000000000000000000000dEaD", chainId: "0x1237" }, async page => {
  await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
  const empty = page.getByText(/No eligible Friends available|No Rare Friends Generations NFTs found/);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const retry = page.getByRole("button", { name: "Retry loading Friends" });
    await Promise.race([empty.waitFor({ timeout: 60000 }), retry.waitFor({ timeout: 60000 })]);
    if (await empty.isVisible()) break;
    await page.waitForTimeout(4000 * attempt);
    await retry.click();
  }
  await empty.waitFor({ timeout: 60000 });
  assert.equal(await page.locator("iframe").count(), 0, "no game frame without an eligible Friend");
  await page.screenshot({ path: `${OUT}/04-no-friends.png` });
});

await scenario("the wrong network is detected before play", { account: holder ?? "0x000000000000000000000000000000000000dEaD", chainId: "0x1" }, async page => {
  await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
  await page.getByRole("button", { name: /Switch to Robinhood/ }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator("iframe").count(), 0, "no game frame on the wrong network");
  await page.screenshot({ path: `${OUT}/05-wrong-network.png` });
});

await browser.close();
server?.closeAllConnections();
server?.close();
console.log(`\n${results.join("\n")}`);
if (results.some(r => r.startsWith("FAIL"))) process.exitCode = 1;
