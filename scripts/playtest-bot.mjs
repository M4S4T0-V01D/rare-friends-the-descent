// Balance playtest: a simple bot plays the real engine at accelerated speed and reports how far it gets.
// It uses only the player's controls (movement keys, attack, bolt, nova, dodge, potion, interact).
import { testGame } from "@rarefriends/friendsdk/testing";
import { installBot } from "./bot-core.mjs";

const RUNS = Number(process.argv[2] ?? 4);
const MAX_SECONDS = Number(process.argv[3] ?? 900);

await testGame(".", {
  width: 1000, height: 720, timeout: 600000,
  check: async ({ page, game }) => {
    await game.getByRole("button", { name: /Begin/ }).click();
    await game.getByRole("button", { name: /Descend/ }).click();
    const child = page.frames().find(f => f.url().includes("game.html"));
    await child.evaluate(() => {
      const g = window.__descent;
      g.renderer = null;
      cancelAnimationFrame(g.raf);
      g.disposed = true;
      g.audio.setMuted(true);
    });
    await child.evaluate(installBot, { smart: Boolean(process.env.SMART), revive: Boolean(process.env.REVIVE) });
    const started = Date.now();
    let seconds = 0;
    while (seconds < MAX_SECONDS) {
      const done = await child.evaluate(({ runs }) => {
        const g = window.__descent, bot = window.__bot;
        for (let i = 0; i < 1200; i++) { bot.step(); g.tick(1 / 60); }
        const cr = g.enemies[0]; return { e0: cr ? { kind: cr.kind, hp: Math.round(cr.hp), max: cr.maxHp, state: cr.state, x: Math.round(cr.pos.x), y: Math.round(cr.pos.y), room: cr.roomId, inv: cr.invulnT, sp: cr.spawnT } : null, atk: g.player.attackCd.toFixed(2), swing: !!g.player.swing, held: [...g.input.held], done: bot.runs.length >= runs, goal: bot.goal, path: bot.path.length, room: g.currentRoom === null ? null : g.floor.rooms[g.currentRoom].type, cleared: g.floor.rooms.map(r => r.type[0] + (r.cleared ? "+" : "-")).join(""), near: g.interactables.filter(it => Math.hypot(it.pos.x - g.player.pos.x, it.pos.y - g.player.pos.y) < 200).map(it => it.kind + ":" + it.label), foes: g.enemies.length, locked: g.lockedRoom, depth: g.depth, screen: g.screen, modal: g.modal.kind, hp: Math.round(g.player.hp), x: Math.round(g.player.pos.x), y: Math.round(g.player.pos.y), runs: bot.runs.length };
      }, { runs: RUNS });
      seconds += 20;
      if (process.env.TRACE) console.log(seconds, JSON.stringify(done));
      if (done.done) break;
    }
    const report = await child.evaluate(() => ({ stuck: window.__bot.stuck, runs: window.__bot.runs, depth: window.__descent.depth, balance: window.__descent.ui.balance }));
    console.log(JSON.stringify(report, null, 1));
    console.log(`simulated ${seconds}s of play in ${Math.round((Date.now() - started) / 1000)}s`);
  },
});
