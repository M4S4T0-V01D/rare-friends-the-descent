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
  }
}

const depthBonus = (w: World, per: number, max: number) => Math.min(max, Math.floor((w.depth - 1) / per));

function shoot(e: Enemy, w: World, angle: number, speed: number, kind: "orb" | "pellet" | "needle" = "orb", radius = 7, dmgScale = 1) {
  w.fire({ pos: { x: e.pos.x + Math.cos(angle) * e.radius, y: e.pos.y - 8 + Math.sin(angle) * e.radius }, vel: fromAngle(angle, speed),
    radius, dmg: e.dmg * dmgScale, owner: "enemy", life: 4.5, color: w.bulletColor, kind, source: e,
    slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed") });
}
export function ring(e: Enemy, w: World, count: number, speed: number, offset = 0, kind: "orb" | "pellet" = "orb") {
  for (let i = 0; i < count; i++) shoot(e, w, offset + (i / count) * TAU, speed, kind);
}
function spread(e: Enemy, w: World, count: number, arc: number, speed: number, kind: "orb" | "pellet" | "needle" = "pellet") {
  const base = angleTo(e.pos, w.player.pos);
  for (let i = 0; i < count; i++) shoot(e, w, base + (count > 1 ? (i / (count - 1) - 0.5) * arc : 0), speed, kind, kind === "pellet" ? 6 : 7);
}

/** Hold a distance band from the player, circling while inside it. */
function keepRange(e: Enemy, w: World, dt: number, min: number, max: number, speed = e.speed) {
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
      w.sound("enemyShot");
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
      w.sound("enemyShot");
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
      w.sound("enemyShot");
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
  if (e.state === "tell") { if (e.stateT > 0.25) { e.state = "lunge"; e.stateT = 0; } return; }
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
      w.sound("enemyShot");
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
    if (e.counter < shots && e.stateT > e.counter * 0.08) { shoot(e, w, e.aim, 400, "needle", 6, 0.75); e.counter++; if (e.counter === 1) w.sound("enemyShot"); }
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
