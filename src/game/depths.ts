/**
 * Creatures of the lower acts (depths 10–30): the Frozen Archive, the Ember Forge, the Rot Garden, the Sunken
 * Choir, the Clockwork Tomb, the Mirror Halls and the Null Throne. Every attack is telegraphed, and each act
 * brings its own idea: slowing frost, burning pools, lingering spores, things under the water, rotating clockwork,
 * reflections, and curtains of void light.
 */
import { attackTempo, melee, steer, type World } from "./enemies";
import { keepRange, spread } from "./bestiary";
import type { Enemy } from "./entities";
import { angleTo, dist, fromAngle, TAU } from "./math";

type Kind = "orb" | "pellet" | "needle" | "shard" | "glob";
/** Fire one enemy bullet from `e` at an angle, with the floor's (or a given) color. */
function bullet(e: Enemy, w: World, angle: number, speed: number, o: { kind?: Kind; radius?: number; dmg?: number; color?: string; slow?: boolean; from?: { x: number; y: number }; life?: number } = {}) {
  const from = o.from ?? { x: e.pos.x + Math.cos(angle) * e.radius * 0.8, y: e.pos.y - 8 + Math.sin(angle) * e.radius * 0.8 };
  w.fire({ pos: { ...from }, vel: fromAngle(angle, speed), radius: o.radius ?? 7, dmg: e.dmg * (o.dmg ?? 1), owner: "enemy", life: o.life ?? 4.5,
    color: o.color ?? w.bulletColor, kind: o.kind ?? "orb", source: e, slow: o.slow || e.mods.includes("frozen"), curse: e.mods.includes("cursed") });
}

export function updateDepths(e: Enemy, w: World, dt: number) {
  switch (e.kind) {
    case "frostmoth": return frostmoth(e, w, dt);
    case "rimeknight": return rimeknight(e, w, dt);
    case "cinderimp": return cinderimp(e, w, dt);
    case "slaggolem": return slaggolem(e, w, dt);
    case "sporeling": return sporeling(e, w, dt);
    case "thorn": return thorn(e, w, dt);
    case "belldiver": return belldiver(e, w, dt);
    case "eel": return eel(e, w, dt);
    case "cog": return cog(e, w, dt);
    case "pendulum": return pendulum(e, w, dt);
    case "shardling": return melee(e, w, dt, 0.26, 90, 38);
    case "mirror": return mirror(e, w, dt);
    case "seraph": return seraph(e, w, dt);
  }
}

// ─── The Frozen Archive ─────────────────────────────────────────────────────

/** Flutters at range and throws a fan of frost needles that slow. */
function frostmoth(e: Enemy, w: World, dt: number) {
  const tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.4 * tempo) {
      const base = angleTo(e.pos, w.player.pos);
      for (let i = -1; i <= 1; i++) bullet(e, w, base + i * 0.22, 300, { kind: "needle", radius: 6, dmg: 0.8, color: "#bfe8ff", slow: true });
      e.state = "float"; e.stateT = 0; e.cd = (2 + w.rng.range(0, 0.6)) * tempo;
    }
    return;
  }
  e.state = "float";
  keepRange(e, w, dt, 180, 300, e.speed * (0.7 + 0.5 * Math.abs(Math.sin(e.anim * 5 + e.seed))));
  if (e.cd <= 0 && dist(e.pos, w.player.pos) < 480 && w.los(e.pos, w.player.pos)) { e.state = "aim"; e.stateT = 0; }
}

/** Marks a line, then charges down it, leaving a trail of slowing frost behind. */
function rimeknight(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.7 * tempo) {
      e.state = "charge"; e.stateT = 0; e.target = undefined;
      w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 330, width: 28, delay: 0.1, dmg: e.dmg * 0.22, linger: 2.2, tick: 0.4, color: "#8fe3ff", slow: true, source: e });
      w.sound("charge");
    }
    return;
  }
  if (e.state === "charge") {
    const dir = fromAngle(e.aim);
    const hit = w.moveCircle(e.pos, e.radius, dir.x * 540 * dt, dir.y * 540 * dt);
    if (!e.target && dist(e.pos, p.pos) < e.radius + p.radius + 4) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg, e, { slow: true }); }
    if (hit.hitX || hit.hitY || e.stateT > 0.6) { e.state = "chase"; e.stateT = 0; e.cd = 2.8 * tempo; e.target = undefined; }
    return;
  }
  e.state = "chase";
  steer(e, w, p.pos, e.speed, dt);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 300 && w.los(e.pos, p.pos)) {
    e.state = "aim"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 330, width: e.radius * 2 + 8, delay: 0.7 * tempo, dmg: 0, color: "#8fe3ff" });
  }
}

// ─── The Ember Forge ────────────────────────────────────────────────────────

/** Hops around and lobs fireballs that leave burning pools where they land. */
function cinderimp(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.35 * tempo) {
      const target = { x: p.pos.x + p.vel.x * 0.3, y: p.pos.y + p.vel.y * 0.3 };
      const d = Math.max(60, dist(e.pos, target)), speed = 300;
      w.fire({ pos: { x: e.pos.x, y: e.pos.y - 10 }, vel: fromAngle(angleTo(e.pos, target), speed), radius: 9, dmg: e.dmg * 0.8, owner: "enemy", life: d / speed, color: "#ff9a3c", kind: "glob", source: e });
      w.hazard({ shape: "circle", pos: target, radius: 48, delay: d / speed, dmg: e.dmg * 0.3, linger: 2.4, tick: 0.5, color: "#ff5a3c", source: e });
      e.state = "hop"; e.stateT = 0; e.cd = (2.1 + w.rng.range(0, 0.6)) * tempo;
    }
    return;
  }
  e.state = "hop";
  keepRange(e, w, dt, 140, 260, e.speed * (Math.sin(e.anim * 9 + e.seed) > 0 ? 1.2 : 0.4));
  if (e.cd <= 0 && dist(e.pos, p.pos) < 420) { e.state = "aim"; e.stateT = 0; }
}

/** Slow and heavy: stomps a ring of molten slag. Breaks into two Cinder Imps when it dies. */
function slaggolem(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "stomp") {
    if (e.counter === 0 && e.stateT > 0.9 * tempo) {
      e.counter = 1; w.shake(6); w.sound("slam");
      const off = w.rng.range(0, TAU);
      for (let i = 0; i < 12; i++) bullet(e, w, off + (i / 12) * TAU, 175, { kind: "pellet", radius: 7, dmg: 0.6, color: "#ff9a3c", from: e.pos });
    }
    if (e.stateT > 1.4 * tempo) { e.state = "chase"; e.stateT = 0; e.cd = 3.2 * tempo; e.counter = 0; }
    return;
  }
  e.state = "chase";
  steer(e, w, p.pos, e.speed, dt);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 170) {
    e.state = "stomp"; e.stateT = 0; e.counter = 0;
    w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 120, delay: 0.9 * tempo, dmg: e.dmg, color: "#ff5a3c", knock: 260, source: e });
  }
}

// ─── The Rot Garden ─────────────────────────────────────────────────────────

/** Keeps its distance, drops a lingering spore cloud where you stand, and spits slow seeds. */
function sporeling(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.6 * tempo) {
      w.hazard({ shape: "circle", pos: { ...p.pos }, radius: 72, delay: 0.8, dmg: e.dmg * 0.3, linger: 3, tick: 0.5, color: "#b9ff6b", slow: true, source: e });
      spread(e, w, 3, 0.5, 160, "orb");
      e.state = "drift"; e.stateT = 0; e.cd = (3 + w.rng.range(0, 0.8)) * tempo;
    }
    return;
  }
  e.state = "drift";
  keepRange(e, w, dt, 220, 340);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 460) { e.state = "aim"; e.stateT = 0; }
}

/** Burrows toward you (untouchable underground), erupts beneath you in a burst of thorns, then sits exposed. */
function thorn(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (e.state === "erupt") {
    if (e.counter === 0 && e.stateT > 0.55) {
      e.counter = 1; e.invulnT = 0; w.sound("slam");
      for (let i = 0; i < 8; i++) bullet(e, w, (i / 8) * TAU + e.seed, 250, { kind: "needle", radius: 6, dmg: 0.7, color: "#6ee07a", from: e.pos });
    }
    if (e.stateT > 2.1) { e.state = "burrow"; e.stateT = 0; }
    return;
  }
  // Burrowed: invisible to blades and bolts until it surfaces.
  e.state = "burrow";
  e.invulnT = 1;
  steer(e, w, p.pos, e.speed, dt);
  if ((dist(e.pos, p.pos) < 40 || e.stateT > 1.8) && e.cd <= 0) {
    e.state = "erupt"; e.stateT = 0; e.counter = 0; e.cd = 1;
    w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 62, delay: 0.55, dmg: e.dmg, color: "#6ee07a", knock: 200, source: e });
  }
}

// ─── The Sunken Choir ───────────────────────────────────────────────────────

/** Dives out of reach, resurfaces near you with a tolling bell ring, then floats, exposed. */
function belldiver(e: Enemy, w: World, dt: number) {
  if (e.state === "dive") {
    e.invulnT = 1;
    if (!e.target) e.target = w.pointNearPlayer(e.roomId, 110, 190);
    steer(e, w, e.target, e.speed * 1.6, dt);
    if (e.stateT > 1.4 || dist(e.pos, e.target) < 12) {
      e.state = "toll"; e.stateT = 0; e.target = undefined;
      w.hazard({ shape: "ring", pos: { ...e.pos }, radius: 130, delay: 0.7, dmg: e.dmg, color: "#7fd4ff", source: e });
    }
    return;
  }
  if (e.state === "toll") {
    if (e.stateT > 0.7 && e.counter === 0) {
      e.counter = 1; e.invulnT = 0; w.sound("summon");
      const off = w.rng.range(0, TAU);
      for (let i = 0; i < 12; i++) bullet(e, w, off + (i / 12) * TAU, 150, { from: e.pos, dmg: 0.6 });
    }
    if (e.stateT > 2.4) { e.state = "dive"; e.stateT = 0; e.counter = 0; }
    else keepRange(e, w, dt, 160, 260, e.speed * 0.35);
    return;
  }
  e.state = "dive"; e.stateT = 0;
}

/** Weaves side to side and sings a wavering stream of bullets. */
function eel(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "sing") {
    e.cd3 -= dt;
    if (e.cd3 <= 0) {
      e.cd3 = 0.08;
      bullet(e, w, e.aim + Math.sin(e.stateT * 7) * 0.55, 230, { radius: 6, dmg: 0.6 });
    }
    if (e.stateT > 1.2) { e.state = "swim"; e.stateT = 0; e.cd = 2.8 * tempo; }
    return;
  }
  e.state = "swim";
  keepRange(e, w, dt, 200, 320, e.speed * (0.8 + 0.4 * Math.sin(e.anim * 4)));
  if (e.cd <= 0 && dist(e.pos, p.pos) < 460 && w.los(e.pos, p.pos)) { e.state = "sing"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos); e.cd3 = 0; }
}

// ─── The Clockwork Tomb ─────────────────────────────────────────────────────

/** Rooted in place: spins three arms of gear-shot, reversing on every tick-tock. */
function cog(e: Enemy, w: World, dt: number) {
  if (dist(e.pos, w.player.pos) > 620) return;
  const cycle = e.anim % 3.8;
  if (cycle > 2.4) return; // wind-up pause between bursts
  e.cd3 -= dt;
  if (e.cd3 <= 0) {
    e.cd3 = 0.15 * attackTempo(e);
    e.aim += Math.floor(e.anim / 3.8) % 2 ? 0.24 : -0.24;
    for (let arm = 0; arm < 3; arm++) bullet(e, w, e.aim + (arm / 3) * TAU, 165, { kind: "pellet", radius: 6, dmg: 0.55, from: e.pos });
  }
}

/** Closes in and swings twice, left then right, each arc marked first. */
function pendulum(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "swing") {
    if (e.stateT > 1.4 * tempo) { e.state = "chase"; e.stateT = 0; e.cd = 2.2 * tempo; }
    return;
  }
  e.state = "chase";
  steer(e, w, p.pos, e.speed, dt);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 150) {
    e.state = "swing"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "cone", pos: { ...e.pos }, angle: e.aim - 0.8, arc: 1.7, radius: 160, delay: 0.6 * tempo, dmg: e.dmg, color: "#ffd23c", knock: 180, source: e });
    w.hazard({ shape: "cone", pos: { ...e.pos }, angle: e.aim + 0.8, arc: 1.7, radius: 160, delay: 1.0 * tempo, dmg: e.dmg, color: "#ffd23c", knock: 180, source: e });
  }
}

// ─── The Mirror Halls ───────────────────────────────────────────────────────

/** Turns its mirror toward you and throws glass. Bolts that hit the mirror's face come straight back (see Game). */
function mirror(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  e.aim = angleTo(e.pos, p.pos);
  if (e.state === "aim") {
    if (e.stateT > 0.5 * tempo) {
      for (let i = -2; i <= 2; i++) bullet(e, w, e.aim + i * 0.18, 260, { kind: "shard", radius: 7, dmg: 0.7, color: "#f3eeff" });
      e.state = "hold"; e.stateT = 0; e.cd = (2.4 + w.rng.range(0, 0.6)) * tempo;
    }
    return;
  }
  e.state = "hold";
  keepRange(e, w, dt, 160, 280);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 440 && w.los(e.pos, p.pos)) { e.state = "aim"; e.stateT = 0; }
}

// ─── The Null Throne ────────────────────────────────────────────────────────

/** Hangs back and lets down curtains of void light with a single gap, or a slow crown of needles. */
function seraph(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT > 0.6 * tempo) {
      const a = angleTo(e.pos, p.pos);
      if (e.counter % 2 === 0) {
        // A curtain: eleven bullets side by side, all flying at you, one gap to slip through.
        const gap = w.rng.int(2, 8), side = fromAngle(a + Math.PI / 2);
        for (let i = 0; i < 11; i++) {
          if (i === gap || i === gap + 1) continue;
          const o = (i - 5) * 26;
          bullet(e, w, a, 150, { from: { x: e.pos.x + side.x * o, y: e.pos.y - 8 + side.y * o }, radius: 8, dmg: 0.7 });
        }
      } else for (let i = 0; i < 16; i++) bullet(e, w, (i / 16) * TAU + e.anim, 120, { kind: "needle", radius: 6, dmg: 0.6, from: e.pos });
      e.counter++;
      e.state = "hover"; e.stateT = 0; e.cd = (3 + w.rng.range(0, 0.6)) * tempo;
    }
    return;
  }
  e.state = "hover";
  keepRange(e, w, dt, 260, 380);
  if (e.cd <= 0 && dist(e.pos, p.pos) < 520) { e.state = "aim"; e.stateT = 0; }
}
