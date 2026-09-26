import { melee, steer, attackTempo, type World } from "./enemies";
import type { Enemy } from "./entities";
import { angleTo, dist, fromAngle, normalize, TAU, type Vec } from "./math";

/**
 * The floor-specific bestiary. Each enemy fires one readable, telegraphed pattern, so rooms feel
 * like a bullet-hell dungeon crawler: dodge-roll through the gaps, then punish.
 */
export function updateBestiary(e: Enemy, w: World, dt: number) {
  switch (e.kind) {
    case "wisp": return wisp(e, w, dt);
    case "gunner": return gunner(e, w, dt);
    case "drone": return drone(e, w, dt);
    case "turret": return turret(e, w, dt);
    case "mite": return mite(e, w, dt);
    case "spitter": return spitter(e, w, dt);
    case "eyestalk": return eyestalk(e, w, dt);
    case "bloodling": return melee(e, w, dt, 0.3, 100, 44);
    case "shade": return shade(e, w, dt);
    case "bomber": return bomber(e, w, dt);
    case "lancer": return lancer(e, w, dt);
    case "hexer": return hexer(e, w, dt);
    case "sniper": return sniper(e, w, dt);
    case "brute": return brute(e, w, dt);
    case "hive": return hive(e, w, dt);
    case "wraith": return wraith(e, w, dt);
    case "prism": return prism(e, w, dt);
  }
}

export const depthBonus = (w: World, per: number, max: number) => Math.min(max, Math.floor((w.depth - 1) / per));

export function shoot(e: Enemy, w: World, angle: number, speed: number, kind: "orb" | "pellet" | "needle" = "orb", radius = 7, dmgScale = 1) {
  w.fire({ pos: { x: e.pos.x + Math.cos(angle) * e.radius, y: e.pos.y - 8 + Math.sin(angle) * e.radius }, vel: fromAngle(angle, speed),
    radius, dmg: e.dmg * dmgScale, owner: "enemy", life: 4.5, color: w.bulletColor, kind, source: e,
    slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed") });
}
export function ring(e: Enemy, w: World, count: number, speed: number, offset = 0, kind: "orb" | "pellet" = "orb") {
  for (let i = 0; i < count; i++) shoot(e, w, offset + (i / count) * TAU, speed, kind);
}
export function spread(e: Enemy, w: World, count: number, arc: number, speed: number, kind: "orb" | "pellet" | "needle" = "pellet") {
  const base = angleTo(e.pos, w.player.pos);
  for (let i = 0; i < count; i++) shoot(e, w, base + (count > 1 ? (i / (count - 1) - 0.5) * arc : 0), speed, kind, kind === "pellet" ? 6 : 7);
}

/** Hold a distance band from the player, circling while inside it. */
export function keepRange(e: Enemy, w: World, dt: number, min: number, max: number, speed = e.speed) {
  const p = w.player.pos, d = dist(e.pos, p);
  let target: Vec;
  if (d < min) target = { x: e.pos.x * 2 - p.x, y: e.pos.y * 2 - p.y };
  else if (d > max) target = p;
  else { const around = angleTo(p, e.pos) + (e.seed % 2 ? 0.8 : -0.8); target = { x: p.x + Math.cos(around) * (min + max) / 2, y: p.y + Math.sin(around) * (min + max) / 2 }; }
  if (d > max && !w.los(e.pos, p)) { steer(e, w, p, speed, dt); return; }
  const dir = normalize(target.x - e.pos.x, target.y - e.pos.y);
  const hit = w.moveCircle(e.pos, e.radius, dir.x * speed * (d < min ? 0.7 : 1) * dt, dir.y * speed * (d < min ? 0.7 : 1) * dt);
  if (hit.hitX || hit.hitY) e.seed++;
}

function wisp(e: Enemy, w: World, dt: number) {
  const tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.5 * tempo) {
      ring(e, w, 8 + 2 * depthBonus(w, 3, 2), 140 + w.depth * 4, e.anim * 0.7);
      e.state = "float"; e.stateT = 0; e.cd = (2.4 + w.rng.range(0, 0.6)) * tempo;
    }
    return;
  }
  e.state = "float";
  keepRange(e, w, dt, 220, 340, e.speed + Math.sin(e.anim * 3) * 30);
  if (e.cd <= 0 && dist(e.pos, w.player.pos) < 520) { e.state = "aim"; e.stateT = 0; }
}

function gunner(e: Enemy, w: World, dt: number) {
  const tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.45 * tempo) {
      spread(e, w, 5 + depthBonus(w, 4, 2), 0.7, 250 + w.depth * 5);
      e.state = "move"; e.stateT = 0; e.cd = (1.8 + w.rng.range(0, 0.5)) * tempo;
    }
    return;
  }
  e.state = "move";
  keepRange(e, w, dt, 180, 280);
  if (e.cd <= 0 && dist(e.pos, w.player.pos) < 420 && w.los(e.pos, w.player.pos)) { e.state = "aim"; e.stateT = 0; e.aim = angleTo(e.pos, w.player.pos); }
}

function drone(e: Enemy, w: World, dt: number) {
  const tempo = attackTempo(e);
  if (e.state === "burst") {
    const shots = 3 + depthBonus(w, 3, 2);
    if (e.counter < shots && e.stateT > e.counter * 0.12) {
      shoot(e, w, angleTo(e.pos, w.player.pos), 320 + w.depth * 6, "pellet", 6);
      e.counter++;
    }
    if (e.counter >= shots) { e.state = "move"; e.stateT = 0; e.cd = (2 + w.rng.range(0, 0.6)) * tempo; }
    keepRange(e, w, dt, 180, 260, e.speed * 0.5);
    return;
  }
  e.state = "move";
  keepRange(e, w, dt, 180, 260);
  if (e.cd <= 0 && w.los(e.pos, w.player.pos)) { e.state = "burst"; e.stateT = -0.35; e.counter = 0; }
}

function turret(e: Enemy, w: World, dt: number) {
  // Stationary: fires a two-armed spiral for 3 s, then cools down for 2 s.
  e.aim += dt * 1.6;
  if (e.state === "fire") {
    e.cd3 -= dt;
    if (e.cd3 <= 0) {
      e.cd3 = Math.max(0.16, 0.24 - w.depth * 0.006);
      const arms = w.depth >= 8 ? 3 : 2;
      for (let i = 0; i < arms; i++) shoot(e, w, e.aim + (i / arms) * TAU, 140 + w.depth * 4, "orb", 7, 0.8);
    }
    if (e.stateT > 2.4) { e.state = "cool"; e.stateT = 0; }
    return;
  }
  if (e.state !== "cool" || e.stateT > 2.6 * attackTempo(e)) {
    if (dist(e.pos, w.player.pos) < 560) { e.state = "fire"; e.stateT = 0; e.cd3 = 0.4; w.sound("charge"); }
  }
}

function mite(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (e.state === "lunge") {
    const dir = fromAngle(e.aim);
    w.moveCircle(e.pos, e.radius, dir.x * 420 * dt, dir.y * 420 * dt);
    if (!e.target && dist(e.pos, p.pos) < e.radius + p.radius + 2) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg, e); }
    if (e.stateT > 0.25) { e.state = "chase"; e.stateT = 0; e.cd = 1.1; e.target = undefined; }
    return;
  }
  if (e.state === "tell") { if (e.stateT > 0.25) { e.state = "lunge"; e.stateT = 0; w.sound("skitter"); } return; }
  e.state = "chase";
  // Swarm around the player rather than stacking on one point.
  const orbit = angleTo(p.pos, e.pos) + (e.seed % 2 ? 0.5 : -0.5);
  const goal = dist(e.pos, p.pos) > 90 ? p.pos : { x: p.pos.x + Math.cos(orbit) * 60, y: p.pos.y + Math.sin(orbit) * 60 };
  steer(e, w, goal, e.speed, dt);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 110) { e.state = "tell"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos); }
}

function spitter(e: Enemy, w: World, dt: number) {
  const tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.55 * tempo) {
      const target = e.target ?? w.player.pos;
      const d = dist(e.pos, target), speed = 260;
      w.fire({ pos: { x: e.pos.x, y: e.pos.y - 10 }, vel: fromAngle(angleTo(e.pos, target), speed), radius: 12, dmg: e.dmg * 1.2, owner: "enemy",
        life: d / speed, color: w.bulletColor, kind: "glob", source: e, burst: { count: 10 + 2 * depthBonus(w, 4, 2), speed: 150, color: w.bulletColor, dmg: e.dmg * 0.8 } });
      w.hazard({ shape: "circle", pos: { ...target }, radius: 40, delay: d / speed, dmg: 0, color: w.bulletColor });
      e.state = "move"; e.stateT = 0; e.cd = (2.6 + w.rng.range(0, 0.6)) * tempo; e.target = undefined;
    }
    return;
  }
  e.state = "move";
  keepRange(e, w, dt, 200, 320);
  if (e.cd <= 0 && dist(e.pos, w.player.pos) < 480) { e.state = "aim"; e.stateT = 0; e.target = { ...w.player.pos }; }
}

function eyestalk(e: Enemy, w: World, dt: number) {
  // Stationary: marks a line with its gaze, then fires a fast stream down it.
  void dt;
  if (e.state === "gaze") {
    if (e.stateT > 0.8 * attackTempo(e)) { e.state = "stream"; e.stateT = 0; e.counter = 0; }
    return;
  }
  if (e.state === "stream") {
    const shots = 4 + depthBonus(w, 4, 2);
    if (e.counter < shots && e.stateT > e.counter * 0.08) { shoot(e, w, e.aim, 400, "needle", 6, 0.75); e.counter++; }
    if (e.counter >= shots) { e.state = "rest"; e.stateT = 0; e.cd = 2.1 * attackTempo(e); }
    return;
  }
  e.state = "rest";
  if (e.cd <= 0 && dist(e.pos, w.player.pos) < 620 && w.los(e.pos, w.player.pos)) {
    e.state = "gaze"; e.stateT = 0; e.aim = angleTo(e.pos, w.player.pos);
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 620, width: 14, delay: 0.8 * attackTempo(e), dmg: 0, color: w.bulletColor });
  }
}

function shade(e: Enemy, w: World, dt: number) {
  const tempo = attackTempo(e);
  if (e.state === "vanish") {
    if (e.stateT > 0.45) {
      w.burst(e.pos.x, e.pos.y, w.bulletColor, 14);
      e.pos = w.pointNearPlayer(e.roomId, 200, 280);
      w.burst(e.pos.x, e.pos.y, w.bulletColor, 14); w.sound("blink");
      ring(e, w, 12 + 2 * depthBonus(w, 4, 3), 160, w.rng.range(0, TAU));
      e.state = "follow"; e.stateT = 0; e.counter = 0;
    }
    return;
  }
  e.state = "follow";
  keepRange(e, w, dt, 180, 300);
  if (e.counter < 2 && e.stateT > 0.8 + e.counter * 0.8) { spread(e, w, 3, 0.35, 300, "needle"); e.counter++; }
  if (e.stateT > 3 * tempo) { e.state = "vanish"; e.stateT = 0; }
}

const mods = (e: Enemy) => ({ slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed") });

/** Grave Bomber: sprints at the Friend, lights its fuse, and bursts. Kill it at range. */
function bomber(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (e.state === "fuse") {
    if (e.stateT >= 0.6 * attackTempo(e)) {
      w.burst(e.pos.x, e.pos.y, "#ff9a3c", 30, 260);
      w.shake(6);
      e.hp = 0; e.dead = true; e.state = "exploded";
    }
    return;
  }
  e.state = "chase";
  steer(e, w, p.pos, e.speed * (dist(e.pos, p.pos) < 180 ? 1.25 : 1), dt);
  if (dist(e.pos, p.pos) < 64) {
    e.state = "fuse"; e.stateT = 0; e.vel = { x: 0, y: 0 };
    w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 84, delay: 0.6 * attackTempo(e), dmg: e.dmg, color: "#ff9a3c", source: e, knock: 280, ...mods(e) });
    w.sound("charge");
  }
}

/** Bone Lancer: marks a line, then skewers straight down it. */
function lancer(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT >= 0.65 * tempo) { e.state = "dash"; e.stateT = 0; e.target = undefined; w.sound("charge"); }
    return;
  }
  if (e.state === "dash") {
    const dir = fromAngle(e.aim);
    const hit = w.moveCircle(e.pos, e.radius, dir.x * 640 * dt, dir.y * 640 * dt);
    if (!e.target && dist(e.pos, p.pos) < e.radius + p.radius + 6) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg, e, mods(e)); }
    if (e.stateT > 0.45 || hit.hitX || hit.hitY) { e.state = "recover"; e.stateT = 0; e.target = undefined; if (hit.hitX || hit.hitY) w.burst(e.pos.x, e.pos.y, "#e9e4ff", 8); }
    return;
  }
  if (e.state === "recover") { if (e.stateT > 0.7 * tempo) { e.state = "move"; e.stateT = 0; e.cd = w.rng.range(1.2, 2) * tempo; } return; }
  e.state = "move";
  keepRange(e, w, dt, 170, 280);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 340 && w.los(e.pos, p.pos)) {
    e.state = "aim"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 300, width: e.radius * 2 + 8, delay: 0.65 * tempo, dmg: 0, color: "#e9e4ff" });
  }
}

/** Hex Priest: brands the floor under the Friend with curses and mends its allies. */
function hexer(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "cast") {
    if (e.stateT >= 0.5 * tempo) {
      if (e.counter % 3 === 2) {
        // Mend: the most wounded ally nearby regains a quarter of its health.
        const hurt = w.enemies.filter(o => !o.dead && o !== e && !o.boss && o.roomId === e.roomId && o.hp < o.maxHp && dist(o.pos, e.pos) < 360)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * 0.25); w.burst(hurt.pos.x, hurt.pos.y - hurt.radius, "#6ee07a", 16, 160); w.sound("summon"); }
      } else {
        for (let i = 0; i < 3; i++) {
          const at = i === 0 ? { ...p.pos } : { x: p.pos.x + w.rng.range(-110, 110), y: p.pos.y + w.rng.range(-90, 90) };
          w.hazard({ shape: "circle", pos: at, radius: 52, delay: 0.85, dmg: e.dmg, color: "#bb66ff", source: e, curse: true, slow: e.mods.includes("frozen") });
        }
      }
      e.counter++;
      e.state = "move"; e.stateT = 0; e.cd = (2.6 + w.rng.range(0, 0.8)) * tempo;
    }
    return;
  }
  e.state = "move";
  keepRange(e, w, dt, 250, 360);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 560) { e.state = "cast"; e.stateT = 0; }
}

/** Relay Sniper: tracks the Friend with a laser sight, locks on, and fires one very fast round. */
function sniper(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "track") {
    e.aim = angleTo(e.pos, p.pos);
    if (e.stateT >= 0.8 * tempo) {
      e.state = "lock"; e.stateT = 0;
      w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 700, width: 12, delay: 0.35, dmg: 0, color: w.bulletColor });
    }
    return;
  }
  if (e.state === "lock") {
    if (e.stateT >= 0.35) {
      shoot(e, w, e.aim, 900, "needle", 7, 1);
      w.sound("snipe");
      e.state = "move"; e.stateT = 0; e.cd = (2.4 + w.rng.range(0, 0.8)) * tempo;
    }
    return;
  }
  e.state = "move";
  keepRange(e, w, dt, 330, 460);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 700 && w.los(e.pos, p.pos)) { e.state = "track"; e.stateT = 0; }
}

/** Flesh Brute: lumbers in and pounds the ground, throwing out a ring of gore. */
function brute(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "pound") {
    if (e.stateT >= 0.85 * tempo) {
      ring(e, w, 10 + 2 * depthBonus(w, 3, 3), 150, w.rng.range(0, TAU));
      w.shake(5);
      e.state = "recover"; e.stateT = 0;
    }
    return;
  }
  if (e.state === "recover") { if (e.stateT > 0.8 * tempo) { e.state = "chase"; e.stateT = 0; e.cd = 1.4 * tempo; } return; }
  e.state = "chase";
  steer(e, w, p.pos, e.speed, dt);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 170) {
    e.state = "pound"; e.stateT = 0; e.vel = { x: 0, y: 0 };
    w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 125, delay: 0.85 * tempo, dmg: e.dmg, color: "#ff4d6d", source: e, knock: 320, ...mods(e) });
  }
}

/** Hive Mother: rooted in place, it births Signal Mites and pulses slow spores. */
function hive(e: Enemy, w: World, dt: number) {
  void dt;
  const tempo = attackTempo(e);
  if (e.cd <= 0 && dist(e.pos, w.player.pos) < 620) {
    e.cd = (3 + w.rng.range(0, 0.6)) * tempo;
    ring(e, w, 6 + depthBonus(w, 4, 2), 110, e.anim, "pellet");
  }
  if (e.cd2 <= 0 && e.counter < 8 && w.enemies.filter(o => !o.dead && o.roomId === e.roomId).length < 14) {
    e.cd2 = 5 * tempo;
    for (let i = 0; i < 2; i++) {
      const a = w.rng.range(0, TAU);
      w.spawn("mite", { x: e.pos.x + Math.cos(a) * 30, y: e.pos.y + Math.sin(a) * 30 }, e.roomId, { minion: true });
      e.counter++;
    }
    w.sound("summon");
  }
}

/** Grave Wraith: all but invisible until it strikes. Watch for the shimmer. */
function wraith(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "reveal") {
    if (e.stateT >= 0.4 * tempo) { e.state = "strike"; e.stateT = 0; e.target = undefined; w.sound("enemySwing"); }
    return;
  }
  if (e.state === "strike") {
    const dir = fromAngle(e.aim);
    w.moveCircle(e.pos, e.radius, dir.x * 540 * dt, dir.y * 540 * dt);
    if (!e.target && dist(e.pos, p.pos) < e.radius + p.radius + 8) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg, e, mods(e)); }
    if (e.stateT > 0.22) { e.state = "visible"; e.stateT = 0; e.target = undefined; }
    return;
  }
  if (e.state === "visible") {
    keepRange(e, w, dt, 140, 220, e.speed * 0.8);
    if (e.stateT > 1.1 * tempo) { e.state = "fade"; e.stateT = 0; e.cd = 0.8 * tempo; }
    return;
  }
  e.state = "fade";
  steer(e, w, p.pos, e.speed, dt);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 130) { e.state = "reveal"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos); e.vel = { x: 0, y: 0 }; }
}

/** Void Prism: spins a sweeping laser, and spits crosses of bullets between beams. */
function prism(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "laser") {
    if (e.stateT > 3.1) { e.state = "drift"; e.stateT = 0; e.cd3 = (4.5 + w.rng.range(0, 1)) * tempo; }
    return;
  }
  e.state = "drift";
  keepRange(e, w, dt, 200, 340);
  e.aim += dt * 1.3;
  if (e.cd <= 0) {
    e.cd = 1.3 * tempo;
    for (let i = 0; i < 4; i++) shoot(e, w, e.aim + (i / 4) * TAU, 170, "orb", 7, 0.8);
  }
  if (e.cd3 <= 0 && dist(e.pos, p.pos) < 520) {
    e.state = "laser"; e.stateT = 0;
    const spin = e.seed % 2 ? 1 : -1, start = angleTo(e.pos, p.pos) - spin * 0.9;
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: start, length: 560, width: 18, delay: 0.9 * tempo, dmg: e.dmg * 0.55, linger: 2.2, tick: 0.2,
      color: w.bulletColor, sweep: spin * 1.1, source: e, curse: e.mods.includes("cursed") });
    w.sound("charge");
  }
}
