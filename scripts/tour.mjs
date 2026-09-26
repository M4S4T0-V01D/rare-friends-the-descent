// A guided tour of all 30 floors on the shipped site: each act's scenery in a live fight, and every boss.
// It checks that nothing throws, that every boss can be beaten and leaves a Waystone, and that beating
// the First Friend at depth 30 conquers the Descent. Screenshots land in the given folder.
// Usage: node scripts/tour.mjs [outdir]   (default artifacts/tour)
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { installBot } from "./bot-core.mjs";
import { cleanup, testSite } from "./harness.mjs";

const OUT = process.argv[2] ?? "artifacts/tour";
await mkdir(OUT, { recursive: true });
const BOSSES = { 3: "warden", 6: "warden", 9: "beast", 12: "archivist", 15: "forgemaster", 18: "bloom", 21: "cantor", 24: "hourengine", 27: "reflection", 30: "firstfriend" };

await testSite({
  width: 1100, height: 780, timeout: 60000, reducedMotion: "no-preference",
  check: async ({ page, game }) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const frame = () => page.frames().find(f => f.url().includes("game.html"));
    const st = () => frame().evaluate(() => window.__descent.debugState());
    const call = (source, arg) => frame().evaluate(({ source, arg }) => new Function("g", "arg", source)(window.__descent, arg), { source, arg });
    const wait = ms => page.waitForTimeout(ms);
    const waitFor = async (predicate, label, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const s = await st(); if (predicate(s)) return s; await wait(100); }
      throw new Error(`timed out: ${label}`);
    };
    const shot = name => page.locator("iframe").screenshot({ path: `${OUT}/${name}.png` });
    const settle = async () => { for (let i = 0; i < 20 && (await st()).modal !== "none"; i++) { await call(`const m = g.modal; if (m.kind === "levelUp") g.chooseBoon(m.options[0]); else g.closeModal()`); await wait(150); } };

    await game.getByRole("heading", { name: "The Descent" }).waitFor();
    await frame().waitForFunction(() => window.__descent);
    await call("g.patch({ settings: { ...g.settings, reducedMotion: false, crt: false } }); g.audio.setMuted(true)");
    await call("g.descend()");
    await waitFor(s => s.screen === "run", "run");
    await frame().evaluate(installBot, { smart: true, revive: true });
    // The tour is about content, not survival: the Friend takes a fraction of damage and never runs dry.
    await call(`const hurt = g.hurtPlayer.bind(g); g.hurtPlayer = (a, s, o) => hurt(a * 0.15, s, o);
      window.__botOn = false; setInterval(() => { if (!window.__botOn) return; g.player.hp = Math.max(g.player.hp, g.stats.maxHp * 0.6); window.__bot.step(); }, 16)`);
    const bot = on => call("window.__botOn = arg; if (!arg) g.input.held.clear()", on);

    for (let depth = 1; depth <= 30; depth++) {
      if ((await st()).depth < depth) { await call("g.debugNextFloor()"); await waitFor(s => s.depth === depth, `depth ${depth}`); }
      await settle();
      await call("g.player.level = Math.max(g.player.level, 1)");
      const s = await st();
      // Scenery: the first floor of every act, mid-fight.
      if (depth % 3 === 1 && depth >= 10) {
        const room = s.rooms.find(r => r.type === "combat" && !r.cleared);
        if (room) {
          await call("g.debugTeleport(arg[0], arg[1])", [room.x, room.y + 40]);
          await bot(true); await wait(3500); await bot(false); await settle();
          await shot(`act-${Math.ceil(depth / 3)}-depth-${depth}`);
          console.log(`depth ${depth}: ${s.floorName ?? ""} scenery captured`);
        }
      }
      // Every creature of this floor's roster can be spawned and fights without errors.
      if (depth >= 10 && depth % 3 === 2) {
        const kinds = await call("return g.floor.band.roster.map(([k]) => k)");
        const room = s.rooms.find(r => r.type === "combat") ?? s.rooms[0];
        await call("g.debugTeleport(arg[0], arg[1])", [room.x, room.y]);
        await call("for (const k of arg) g.debugSpawn(k)", kinds);
        await bot(true); await wait(2500); await bot(false); await settle();
        await call("g.enemies = []");
      }
      if (BOSSES[depth]) {
        const room = (await st()).rooms.find(r => r.type === "boss");
        await call("g.debugTeleport(arg[0], arg[1])", [room.x, room.y + 120]);
        const fight = await waitFor(s => s.boss, `boss at ${depth}`);
        assert.equal(await call("return g.boss.kind"), BOSSES[depth], `the right boss at depth ${depth}`);
        await bot(true); await wait(5500);
        await shot(`boss-${depth}-${BOSSES[depth]}`);
        // Take it to its last phase, then finish it.
        await call("g.boss.hp = Math.max(1, g.boss.maxHp * 0.3)"); await wait(2500);
        await bot(false);
        const hit = await call("const b = g.boss; b.invulnT = 0; b.shield = 0; b.hp = 1; g.dealDamage(b, 1000, { source: 'nova' }); return { dead: b.dead, hp: b.hp, state: b.state, boss: Boolean(g.boss) }");
        await waitFor(s => !s.boss && s.interactables.some(it => it.kind === "waystone"), `waystone after ${BOSSES[depth]} (${JSON.stringify(hit)})`);
        console.log(`depth ${depth}: ${fight.boss.name} beaten`);
        await settle();
      }
    }
    // The First Friend is down: escaping now conquers the Descent.
    assert.equal(await call("return g.escapeOutcome"), "conquered");
    const way = (await st()).interactables.find(it => it.kind === "waystone");
    await call("g.debugTeleport(arg[0], arg[1])", [way.x, way.y + 30]);
    await call("g.input.press('interact')"); await wait(600);
    await waitFor(s => s.modal === "waystone", "waystone dialog");
    await call("g.waystoneEscape()");
    const end = await waitFor(s => s.screen === "summary", "summary");
    assert.equal(await call("return g.ui.summary.outcome"), "conquered");
    await wait(1500);
    await shot("conquered");
    console.log(`conquered at depth ${end.depth}; errors: ${errors.length}`);
    assert.deepEqual(errors, [], "no page errors on the whole tour");
  },
});
await cleanup();
