// Balance playtest: a simple bot plays the real engine at accelerated speed and reports how far it gets.
// It uses only the player's controls (movement keys, attack, bolt, nova, dodge, potion, interact).
import { testGame } from "@rarefriends/friendsdk/testing";

const RUNS = Number(process.argv[2] ?? 4);
const MAX_SECONDS = Number(process.argv[3] ?? 900);

await testGame(".", {
  width: 1000, height: 720, timeout: 600000,
  check: async ({ page, game }) => {
    await game.getByRole("button", { name: /Begin/ }).click();
    await game.getByRole("button", { name: /Descend/ }).click();
    const child = page.frames().find(f => f.url().includes("game.html"));
    await child.evaluate((opts) => {
      const g = window.__descent;
      g.renderer = null;
      cancelAnimationFrame(g.raf);
      g.disposed = true;
      g.audio.setMuted(true);
      // The harness moved the real mouse over the stage; the bot aims like a keyboard player.
      g.input.mouse.inside = false;
      const TILE = 32;
      const bot = { runs: [], path: [], pathAt: -1, target: null, stuck: 0, last: { x: 0, y: 0 }, floorStart: 0, floorTimes: [] };
      window.__bot = bot;
      const solid = (tx, ty) => {
        const f = g.floor, t = f.tiles[ty * f.width + tx];
        if (t === 0 || t === 2) return true;
        const x = tx * TILE + 16, y = ty * TILE + 16;
        return g.barriers.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
      };
      const bfs = (from, to) => {
        const f = g.floor, w = f.width, start = Math.floor(from.y / TILE) * w + Math.floor(from.x / TILE), goal = Math.floor(to.y / TILE) * w + Math.floor(to.x / TILE);
        const prev = new Int32Array(f.tiles.length).fill(-1); prev[start] = start;
        const q = [start];
        for (let h = 0; h < q.length; h++) {
          const i = q[h]; if (i === goal) break;
          const x = i % w, y = (i - x) / w;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = (y + dy) * w + x + dx;
            if (prev[j] !== -1 || solid(x + dx, y + dy)) continue;
            prev[j] = i; q.push(j);
          }
        }
        if (prev[goal] === -1) return null;
        const path = [];
        for (let i = goal; i !== start; i = prev[i]) path.push({ x: (i % w) * TILE + 16, y: Math.floor(i / w) * TILE + 16 });
        return path.reverse();
      };
      const steer = (to) => {
        g.input.held.clear();
        const dx = to.x - g.player.pos.x, dy = to.y - g.player.pos.y;
        if (Math.abs(dx) > 3) g.input.held.add(dx > 0 ? "d" : "a");
        if (Math.abs(dy) > 3) g.input.held.add(dy > 0 ? "s" : "w");
      };
      bot.step = () => {
        if (g.screen === "summary") {
          const s = g.ui.summary;
          bot.runs.push({ minHp: Math.round((bot.minHp ?? 1) * 100), potions: bot.potions ?? 0, hpMax: g.stats.maxHp, atk: g.stats.atk, armor: g.stats.armor, revives: bot.revives ?? 0, outcome: s.outcome, killedBy: g.lastHitBy, dmg: Object.fromEntries([...g.damageTally].map(([k, v]) => [k.replace(/ FRIEND| CRAWLER/, ""), v])), room: bot.deathRoom, depth: s.depth, kills: s.kills, level: s.level, earned: s.rfEarned, floorTimes: bot.floorTimes.join("/") });
          bot.floorTimes = []; bot.revives = 0; bot.minHp = 1; bot.potions = 0;
          void g.descend();
          return;
        }
        if (g.screen !== "run") return;
        const m = g.modal;
        if (m.kind === "levelUp") return g.chooseBoon(m.options[0]);
        if (m.kind === "loot") return g.chooseLoot(0);
        if (m.kind === "reveal") return g.closeModal();
        if (m.kind === "death" && opts.revive && g.ui.balance >= 10) { bot.revives = (bot.revives ?? 0) + 1; return void g.revive(g.ui.balance >= 25 ? "full" : "partial"); }
        if (m.kind === "death") { bot.deathRoom = `${g.floor.rooms[g.currentRoom ?? 0]?.type}:${g.enemies.map(e => e.kind[0]).join("")}`; return g.endRunFromDeath(); }
        if (m.kind === "waystone") return g.depth >= 9 ? g.waystoneEscape() : g.waystoneDescend();
        if (m.kind !== "none") return g.closeModal();
        const p = g.player;
        if (p.dead) return;
        if (Math.hypot(p.pos.x - bot.last.x, p.pos.y - bot.last.y) > 24) { bot.last = { ...p.pos }; bot.stillSince = g.time; }
        else if (g.time - (bot.stillSince ?? g.time) > 30 && !bot.reportedStuck) {
          bot.reportedStuck = true;
          bot.stuck = { depth: g.depth, pos: { ...p.pos }, goal: bot.goal, room: g.currentRoom === null ? null : g.floor.rooms[g.currentRoom].type, locked: g.lockedRoom,
            foes: g.enemies.map(e => ({ kind: e.kind, x: Math.round(e.pos.x), y: Math.round(e.pos.y), spawn: e.spawnT })), modal: g.modal.kind };
        }
        if (g.depth !== bot.depth) { bot.floorTimes.push(Math.round((g.time - bot.floorStart))); bot.floorStart = g.time; bot.depth = g.depth; bot.path = []; }
        const s = g.stats;
        bot.minHp = Math.min(bot.minHp ?? 1, p.hp / s.maxHp);
        if (p.hp < s.maxHp * 0.5 && p.potions > 0 && p.potionCd <= 0) { g.input.press("potion"); bot.potions = (bot.potions ?? 0) + 1; }
        // Sidestep incoming enemy projectiles.
        const orb = g.projectiles.find(o => o.owner === "enemy" && Math.hypot(o.pos.x - p.pos.x, o.pos.y - p.pos.y) < 90 &&
          ((p.pos.x - o.pos.x) * o.vel.x + (p.pos.y - o.pos.y) * o.vel.y) > 0);
        if (orb && opts.smart) {
          const side = { x: -orb.vel.y, y: orb.vel.x };
          g.input.held.clear();
          g.input.held.add(Math.abs(side.x) > Math.abs(side.y) ? (side.x > 0 ? "d" : "a") : (side.y > 0 ? "s" : "w"));
          if (Math.hypot(orb.pos.x - p.pos.x, orb.pos.y - p.pos.y) < 45 && p.dodgeCd <= 0) g.input.press("dodge");
          return;
        }
        // Dodge out of telegraphed attacks.
        const danger = g.hazards.find(h => h.owner === "enemy" && !h.fired && h.dmg > 0 && h.delay < 0.35 && g["hazardHits"](h, p.pos, p.radius + 8));
        if (danger && p.dodgeCd <= 0) {
          const away = { x: p.pos.x - danger.pos.x, y: p.pos.y - danger.pos.y };
          g.input.held.clear();
          g.input.held.add(Math.abs(away.x) > Math.abs(away.y) ? (away.x > 0 ? "d" : "a") : (away.y > 0 ? "s" : "w"));
          g.input.press("dodge");
          return;
        }
        const foes = g.enemies.filter(e => !e.dead && e.spawnT <= 0 && e.roomId === (g.lockedRoom ?? g.currentRoom));
        if (foes.length) {
          foes.sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.y - p.pos.y) - Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y));
          const e = foes[0], d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
          const near = foes.filter(f => Math.hypot(f.pos.x - p.pos.x, f.pos.y - p.pos.y) < 160).length;
          if (near >= 3 && p.energy >= 40 && p.novaCd <= 0) g.input.press("nova");
          if (d > e.radius + 50) {
            if (d < 460 && p.energy > 50 && p.boltCd <= 0 && g.los(p.pos, e.pos)) g.input.press("bolt");
            if (!g.los(p.pos, e.pos)) { const path = bfs(p.pos, e.pos); if (path?.length) return steer(path[0]); }
            steer(e.pos);
          } else { g.input.held.clear(); g.input.held.add("attack"); }
          return;
        }
        g.input.held.delete("attack");
        // Collect nearby loot, then head for the next uncleared room or the stairs.
        const drop = g.pickups.find(pk => pk.kind === "item" && Math.hypot(pk.pos.x - p.pos.x, pk.pos.y - p.pos.y) < 400);
        let goal = drop?.pos;
        if (!goal) {
          const rooms = g.floor.rooms.filter(r => r.main && !r.cleared && ["combat", "elite", "boss"].includes(r.type));
          const exit = g.interactables.find(it => it.kind === "waystone") ?? g.interactables.find(it => it.kind === "stairs");
          if (rooms.length) goal = { x: (rooms[0].x + rooms[0].w / 2) * TILE, y: (rooms[0].y + rooms[0].h / 2) * TILE };
          else if (exit) {
            goal = exit.pos;
            if (Math.hypot(exit.pos.x - p.pos.x, exit.pos.y - p.pos.y) < 50) { g.input.held.clear(); g.input.press("interact"); return; }
          }
        }
        if (!goal) return;
        if (!bot.path.length || g.time - bot.pathAt > 1 || !bot.goal || Math.hypot(bot.goal.x - goal.x, bot.goal.y - goal.y) > 40) {
          bot.path = bfs(p.pos, goal) ?? []; bot.pathAt = g.time; bot.goal = goal;
        }
        while (bot.path.length && Math.hypot(bot.path[0].x - p.pos.x, bot.path[0].y - p.pos.y) < 14) bot.path.shift();
        if (bot.path.length) steer(bot.path[0]); else steer(goal);
      };
    }, { smart: Boolean(process.env.SMART), revive: Boolean(process.env.REVIVE) });
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
