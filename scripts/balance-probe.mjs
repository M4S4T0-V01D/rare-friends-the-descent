// Balance probe for all 30 floors. At each probed depth the Friend gets a level and gear typical for that depth,
// then the playtest bot clears three combat rooms and fights the boss (simulated at full speed). The Friend cannot
// die here: damage taken is measured instead, as a share of max HP, so every act can be compared on one scale.
// Usage: node scripts/balance-probe.mjs [depths...]   (default: 3 6 9 12 15 18 21 24 27 30)
import { installBot } from "./bot-core.mjs";
import { cleanup, testSite } from "./harness.mjs";

const DEPTHS = process.argv.slice(2).map(Number).filter(Boolean);
const depths = DEPTHS.length ? DEPTHS : [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];
/** Typical Friend level and gear rarity on arrival at a depth (from full bot runs through depth 9, extrapolated). */
const levelAt = d => Math.round(d <= 9 ? 2 * d : 18 + (d - 9) * 1.1);
const rarityAt = d => (d < 7 ? "rare" : d < 16 ? "epic" : "legendary");

const rows = [];
await testSite({
  width: 1000, height: 720, timeout: 600000,
  check: async ({ page, game }) => {
    const frame = () => page.frames().find(f => f.url().includes("game.html"));
    const call = (source, arg) => frame().evaluate(({ source, arg }) => new Function("g", "arg", source)(window.__descent, arg), { source, arg });
    await game.getByRole("heading", { name: "The Descent" }).waitFor();
    await frame().waitForFunction(() => window.__descent);
    await call("g.audio.setMuted(true); g.descend()");
    await call("g.renderer = null; cancelAnimationFrame(g.raf); g.disposed = true");
    await frame().evaluate(installBot, { smart: true, revive: false });
    for (const depth of depths) {
      await call("while (g.depth < arg) g.debugNextFloor()", depth);
      await call("g.debugOutfit(arg[0], arg[1])", [levelAt(depth), rarityAt(depth)]);
      const stats = await call("return { hp: g.stats.maxHp, atk: g.stats.atk, armor: g.stats.armor }");
      // Fight until the room is clear (or 120 simulated seconds), with a bottomless health pool, and measure.
      const fight = (where, boss) => call(`
        const room = g.floor.rooms.find(r => r.type === arg.type && !r.cleared);
        if (!room) return null;
        g.debugTeleport((room.x + room.w / 2) * 32, (room.y + room.h / 2) * 32 + (arg.boss ? 120 : 40));
        // Health is measured tick by tick: every drop counts as damage taken, and the Friend is topped up below half.
        let t = 0, taken = 0; const bot = window.__bot, p = g.player;
        for (; t < 150 * 60; t++) {
          const before = p.hp;
          bot.step(); g.tick(1 / 60);
          if (p.hp < before) taken += before - p.hp;
          if (p.hp < g.stats.maxHp * 0.5 || p.dead) { p.hp = g.stats.maxHp; p.dead = false; if (g.modal.kind === "death") g.closeModal(); }
          if (t > 180 && g.lockedRoom === null && !g.enemies.some(e => !e.dead && e.roomId === room.id)) break;
        }
        p.hp = g.stats.maxHp;
        return { seconds: Math.round(t / 60), taken: Math.round(taken), cleared: g.lockedRoom === null && !g.enemies.some(e => !e.dead && e.roomId === room.id) };
      `, { type: where, boss });
      const rooms = [];
      for (let i = 0; i < 3; i++) { const r = await fight("combat", false); if (r) rooms.push(r); }
      const boss = await fight("boss", true);
      const avg = (xs, k) => xs.reduce((t, x) => t + x[k], 0) / Math.max(1, xs.length);
      rows.push({
        depth, level: levelAt(depth), gear: rarityAt(depth), maxHp: stats.hp, atk: stats.atk,
        "room s": avg(rooms, "seconds").toFixed(0), "room dmg ×HP": (avg(rooms, "taken") / stats.hp).toFixed(2),
        "boss s": boss?.seconds ?? "-", "boss dmg ×HP": boss ? (boss.taken / stats.hp).toFixed(2) : "-", "boss down": boss?.cleared ?? "-",
      });
      console.log(`depth ${depth} probed`);
    }
  },
});
await cleanup();
console.log("Damage is shown as multiples of the Friend's max HP (1.00 = one full health bar lost; potions and dodging decide the rest).");
console.table(rows);
