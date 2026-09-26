// The playtest bot's controller: plays the real engine through the player's own controls (movement keys,
// attack, bolt, signature, dodge, potion, interact). Runs inside the game frame, so it must stay self-contained.
// Used at accelerated speed by playtest-bot.mjs and in real time by trailer.mjs.
export function installBot(opts) {
  const g = window.__descent;
  // The harness moved the real mouse over the stage; the bot aims like a keyboard player.
  g.input.mouse.inside = false;
  const TILE = 32;
  const bot = { runs: [], path: [], pathAt: -1, target: null, stuck: 0, last: { x: 0, y: 0 }, floorStart: 0, floorTimes: [], ignore: new Set(), goalSince: 0 };
  // A goal the bot cannot reach (loot behind a closed gate, say) is dropped after a few seconds without progress.
  const key = goal => `${g.depth}:${Math.round(goal.x / 16)}:${Math.round(goal.y / 16)}`;
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
      if (s === bot.lastSummary) { bot.retries = (bot.retries ?? 0) + 1; if (bot.retries % 60 === 0) g.descend().catch(e => { bot.error = String(e && e.stack || e); }); return; }
      bot.lastSummary = s; bot.retries = 0;
      bot.runs.push({ minHp: Math.round((bot.minHp ?? 1) * 100), potions: bot.potions ?? 0, hpMax: g.stats.maxHp, atk: g.stats.atk, armor: g.stats.armor, revives: bot.revives ?? 0, outcome: s.outcome, killedBy: g.lastHitBy, dmg: Object.fromEntries([...g.damageTally].map(([k, v]) => [k.replace(/ FRIEND| CRAWLER/, ""), v])), room: bot.deathRoom, depth: s.depth, kills: s.kills, level: s.level, earned: s.rfEarned, floorTimes: bot.floorTimes.join("/") });
      bot.floorTimes = []; bot.revives = 0; bot.minHp = 1; bot.potions = 0;
      g.descend().catch(e => { bot.error = String(e && e.stack || e); });
      return;
    }
    if (g.screen !== "run") return;
    const m = g.modal;
    if (m.kind === "levelUp") return g.chooseBoon(m.options[0]);
    if (m.kind === "loot") return g.chooseLoot(0);
    if (m.kind === "reveal") return g.closeModal();
    if (m.kind === "death" && opts.revive && g.ui.balance >= 10) { bot.revives = (bot.revives ?? 0) + 1; return void g.revive(g.ui.balance >= 25 ? "full" : "partial"); }
    if (m.kind === "death") { bot.deathRoom = `${g.floor.rooms[g.currentRoom ?? 0]?.type}:${g.enemies.map(e => e.kind[0]).join("")}`; return g.endRunFromDeath(); }
    if (m.kind === "waystone") return g.depth >= 30 ? g.waystoneEscape() : g.waystoneDescend();
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
    const drop = g.pickups.find(pk => pk.kind === "item" && Math.hypot(pk.pos.x - p.pos.x, pk.pos.y - p.pos.y) < 400 && !bot.ignore.has(key(pk.pos)));
    let goal = drop?.pos;
    if (!goal) {
      const rooms = g.floor.rooms.filter(r => r.main && !r.cleared && ["combat", "elite", "guardian", "boss"].includes(r.type) && !bot.ignore.has(key({ x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE })));
      const exit = g.interactables.find(it => it.kind === "waystone") ?? g.interactables.find(it => it.kind === "stairs");
      if (rooms.length) goal = { x: (rooms[0].x + rooms[0].w / 2) * TILE, y: (rooms[0].y + rooms[0].h / 2) * TILE };
      else if (exit) {
        goal = exit.pos;
        if (Math.hypot(exit.pos.x - p.pos.x, exit.pos.y - p.pos.y) < 50) { g.input.held.clear(); g.input.press("interact"); return; }
      }
    }
    if (!goal) return;
    if (g.time - (bot.stillSince ?? g.time) > 6 && bot.goal && Math.hypot(bot.goal.x - goal.x, bot.goal.y - goal.y) < 40) {
      bot.ignore.add(key(goal)); bot.stillSince = g.time; bot.path = []; return;
    }
    if (!bot.path.length || g.time - bot.pathAt > 1 || !bot.goal || Math.hypot(bot.goal.x - goal.x, bot.goal.y - goal.y) > 40) {
      bot.path = bfs(p.pos, goal) ?? []; bot.pathAt = g.time; bot.goal = goal;
    }
    while (bot.path.length && Math.hypot(bot.path[0].x - p.pos.x, bot.path[0].y - p.pos.y) < 14) bot.path.shift();
    if (bot.path.length) steer(bot.path[0]); else steer(goal);
  };
}
