// Captures showcase screenshots of the shipped site (mock wallet fixture, Friend #7730) for the README.
// Usage: node scripts/screenshots.mjs [outdir]   (default docs/screenshots)
import { mkdir } from "node:fs/promises";
import { cleanup, testSite } from "./harness.mjs";

const OUT = process.argv[2] ?? "docs/screenshots";
await mkdir(OUT, { recursive: true });

await testSite({
  width: 1100, height: 780, timeout: 30000,
  check: async ({ page, game }) => {
    const frame = () => page.frames().find(f => f.url().includes("game.html"));
    const st = () => frame().evaluate(() => window.__descent.debugState());
    const call = (source, arg) => frame().evaluate(({ source, arg }) => new Function("g", "arg", source)(window.__descent, arg), { source, arg });
    const teleport = (x, y) => call("g.debugTeleport(arg[0], arg[1])", [x, y]);
    const stage = page.locator("iframe");
    const shot = async name => { await stage.screenshot({ path: `${OUT}/${name}.png` }); console.log(`saved ${OUT}/${name}.png`); };
    const waitFor = async (predicate, timeout = 8000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const s = await st(); if (predicate(s)) return s; await page.waitForTimeout(100); }
      throw new Error("timed out");
    };
    await game.getByRole("heading", { name: "The Descent" }).waitFor();
    await frame().waitForFunction(() => window.__descent);
    // Headless Chromium reports reduced motion; showcase shots use the full effects.
    await call("g.patch({ settings: { ...g.settings, reducedMotion: false, crt: true, screenShake: true } })");
    await shot("title");
    await page.keyboard.press("Enter");
    await waitFor(s => s.screen === "camp");
    await page.waitForTimeout(800);
    await shot("camp");
    const stairs = (await st()).interactables.find(it => it.label === "THE DESCENT");
    for (const [name, dy] of [["camp-stairs", 30], ["camp-stairs-climb", -50]]) {
      await teleport(stairs.x, stairs.y + dy);
      await page.waitForTimeout(500);
      await shot(name);
    }
    await teleport(stairs.x, stairs.y + 20);
    await page.locator("iframe").click({ position: { x: 480, y: 420 } });
    await page.keyboard.press("e");
    await game.getByRole("button", { name: "Begin the Descent" }).click();
    await waitFor(s => s.screen === "run" && s.depth === 1);

    const settle = async () => {
      for (let i = 0; i < 20; i++) {
        const s = await st();
        if (s.modal === "levelUp") await page.keyboard.press("1");
        else if (s.modal !== "none") await page.keyboard.press("Escape");
        else return;
        await page.waitForTimeout(300);
      }
    };
    for (const depth of [1, 3, 5, 8]) {
      for (let d = (await st()).depth; d < depth; d++) { await call("g.debugNextFloor()"); await waitFor(s => s.depth > d, 12000); await settle(); }
      await page.waitForTimeout(2800); // let the floor banner fade
      await settle();
      const room = (await st()).rooms.find(r => r.type === "combat" && !r.cleared);
      if (!room) continue;
      await teleport(room.x, room.y + 60);
      await waitFor(s => s.foes.length > 0 && s.foes.every(f => !f.spawning), 8000).catch(() => {});
      await page.locator("iframe").click({ position: { x: 480, y: 420 } });
      await page.keyboard.down("j");
      await page.waitForTimeout(1500);
      await call("g.player.hp = g.stats.maxHp");
      await shot(`combat-depth-${depth}`);
      await page.keyboard.up("j");
      await call("g.debugKillRoom()");
      await page.waitForTimeout(400);
      await settle();
    }
    await call("g.debugGiveItems(6)");
    await page.keyboard.press("c");
    await page.waitForTimeout(600);
    await shot("inventory");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("b");
    await page.waitForTimeout(600);
    await shot("bestiary");
    await page.keyboard.press("Escape");

    // Back at camp: the wardrobe, the Blessing Shrine, and the camp restored tier by tier.
    await settle();
    await call("g.endRun('escaped'); g.enterCamp(); g.debugGrant(2000)");
    await waitFor(s => s.screen === "camp");
    // A Friend wearing earned rewards: the Little Archivist, the Crown of the First Friend and the Genesis Halo.
    await call(`for (const id of ["pet-archivist", "pet-bloom", "pet-hourengine", "pet-reflection", "pet-firstfriend", "hat-genesis", "glow-genesis"]) g.ownedCosmetics.add(id);
      for (const id of ["pet-archivist", "hat-genesis", "glow-genesis"]) g.wearCosmetic(id)`);
    const stairs2 = (await st()).interactables.find(it => it.label === "THE DESCENT");
    for (let tier = 0; tier <= 3; tier++) {
      await call("g.campTier = arg; g.enterCamp(); g.wearCosmetic('pet-archivist')", tier);
      await teleport(stairs2.x, stairs2.y + 330);
      await page.waitForTimeout(1200);
      await shot(`camp-tier-${tier}`);
    }
    await teleport(stairs2.x - 120, stairs2.y + 200);
    await page.waitForTimeout(1200);
    await shot("rewards-worn");
    const panel = async (tab, name, scrollTo) => {
      await call("g.openCampPanel(arg)", tab);
      await page.waitForTimeout(500);
      if (scrollTo) await game.getByRole("heading", { name: scrollTo }).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(name);
      await call("g.closeCampPanel()");
    };
    await panel("wardrobe", "wardrobe-pets", /^Pets/);
    await panel("wardrobe", "wardrobe-hats", /^Hats/);
    await panel("wardrobe", "wardrobe-skins", /^Skins/);
    await panel("blessing", "blessing-shrine");
    await panel("sanctuary", "sanctuary");
  },
});
await cleanup();
