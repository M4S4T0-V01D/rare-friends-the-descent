/**
 * The bosses of the lower acts: one at the bottom of every act from depth 12 to depth 30.
 * Like the Warden and the Rare Beast, each walks (or waits), picks a weighted attack, telegraphs it,
 * and grows faster and meaner at each phase threshold.
 */
import { bossPhase, steer, type World } from "./enemies";
import type { Enemy, EnemyKind } from "./entities";
import { angleTo, dist, fromAngle, TAU, type Vec } from "./math";

type Opts = { kind?: "orb" | "pellet" | "needle" | "shard" | "glob"; radius?: number; dmg?: number; color: string; slow?: boolean; curse?: boolean; from?: Vec; life?: number };
function fire(e: Enemy, w: World, angle: number, speed: number, o: Opts) {
  const from = o.from ?? { x: e.pos.x, y: e.pos.y - e.radius * 0.6 };
  w.fire({ pos: { ...from }, vel: fromAngle(angle, speed), radius: o.radius ?? 8, dmg: e.dmg * (o.dmg ?? 0.6), owner: "enemy", life: o.life ?? 4.5,
    color: o.color, kind: o.kind ?? "orb", source: e, slow: o.slow, curse: o.curse });
}
function ringOf(e: Enemy, w: World, count: number, speed: number, offset: number, o: Opts) {
  for (let i = 0; i < count; i++) fire(e, w, offset + (i / count) * TAU, speed, o);
}
/** Walk (or wait), then after a beat choose the next attack by weight. */
function choose(e: Enemy, w: World, dt: number, pause: number, options: [string, number][], range = 220): string | null {
  const p = w.player;
  if (e.speed > 0) {
    const d = dist(e.pos, p.pos);
    if (d > range) steer(e, w, p.pos, e.speed * (e.phase >= 2 ? 1.2 : 1), dt);
  }
  if (e.stateT < pause) return null;
  e.stateT = 0;
  return w.rng.weighted(options.filter(([, weight]) => weight > 0) as [string, number][]);
}
function common(e: Enemy, w: World, dt: number, thresholds: number[]): boolean {
  if (e.invulnT > 0) e.invulnT -= dt;
  if (bossPhase(e, w, thresholds)) return true;
  if (e.state === "roar") { if (e.stateT > 1.1) { e.state = "idle"; e.stateT = 0; } return true; }
  if (e.state === "attack") { if (e.stateT > (e.phase >= 2 ? 0.8 : 1)) { e.state = "idle"; e.stateT = 0; } return true; }
  return false;
}
const minionsOf = (e: Enemy, w: World) => w.enemies.filter(o => !o.dead && o.minion && o.roomId === e.roomId).length;

export function updateBoss(e: Enemy, w: World, dt: number) {
  switch (e.kind) {
    case "archivist": return archivist(e, w, dt);
    case "forgemaster": return forgemaster(e, w, dt);
    case "bloom": return bloom(e, w, dt);
    case "cantor": return cantor(e, w, dt);
    case "hourengine": return hourengine(e, w, dt);
    case "reflection": return e.minion ? decoy(e, w, dt) : reflection(e, w, dt);
    case "firstfriend": return firstfriend(e, w, dt);
  }
}

// ─── The Archivist (depth 12): ice, pages and the frozen dead ───────────────

const ICE = "#bfe8ff";
function archivist(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.5])) return;
  const fast = e.phase >= 2 ? 0.8 : 1;
  if (e.state === "index") {
    // Three fans of frost needles, each a little wider.
    if (e.stateT > e.counter * 0.35 && e.counter < 3) {
      const base = angleTo(e.pos, p.pos), n = 7 + e.counter * 2;
      for (let i = 0; i < n; i++) fire(e, w, base + (i / (n - 1) - 0.5) * (0.9 + e.counter * 0.25), 280, { kind: "needle", radius: 6, color: ICE, slow: true });
      e.counter++;
    }
    if (e.stateT > 1.2) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "blizzard") {
    if (e.cd3 <= 0) {
      e.cd3 = 0.1; e.aim += 0.23;
      for (let arm = 0; arm < 2; arm++) fire(e, w, e.aim + arm * Math.PI, 150, { radius: 7, color: "#e9f6ff", slow: true, dmg: 0.5 });
    }
    if (e.stateT > 2.2) { e.state = "idle"; e.stateT = 0; e.cd3 = 5; }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const pick = choose(e, w, dt, 1.0 * fast, [
    ["index", 3], ["catalog", 2.5], ["shelve", minionsOf(e, w) < 3 && e.minionCd <= 0 ? 2 : 0], ["freeze", 2], ["blizzard", e.phase >= 2 && e.cd3 <= 0 ? 3 : 0],
  ]);
  if (!pick) return;
  if (pick === "index") { e.state = "index"; e.counter = 0; w.sound("charge"); }
  else if (pick === "catalog") {
    // Four frozen lines across your path, with gaps between them.
    e.state = "attack";
    const a = angleTo(e.pos, p.pos), across = a + Math.PI / 2;
    for (let i = -2; i <= 1; i++) {
      const o = (i + 0.5) * 95;
      const start = { x: p.pos.x + Math.cos(a) * o - Math.cos(across) * 360, y: p.pos.y + Math.sin(a) * o - Math.sin(across) * 360 };
      w.hazard({ shape: "line", pos: start, angle: across, length: 720, width: 34, delay: 1.0 * fast, dmg: e.dmg, color: ICE, slow: true, source: e });
    }
  } else if (pick === "shelve") {
    e.state = "attack"; e.minionCd = 12; w.sound("summon");
    w.spawn("cursed", w.pointNearPlayer(e.roomId, 140, 260), e.roomId, { minion: true, mods: ["frozen"] });
    w.spawn(e.phase >= 2 ? "frostmoth" : "cursed", w.pointNearPlayer(e.roomId, 140, 260), e.roomId, { minion: true, mods: ["frozen"] });
  } else if (pick === "freeze") {
    e.state = "attack";
    const at = { ...p.pos };
    w.hazard({ shape: "circle", pos: at, radius: 100, delay: 0.9 * fast, dmg: e.dmg * 1.2, color: ICE, slow: true, source: e, knock: 200 });
    if (e.phase >= 2) for (let i = 0; i < 6; i++) fire(e, w, (i / 6) * TAU, 210, { kind: "needle", color: ICE, slow: true, from: at, radius: 6 });
  } else if (pick === "blizzard") { e.state = "blizzard"; e.aim = angleTo(e.pos, p.pos); e.cd3 = 0; }
}

// ─── The Forgemaster (depth 15): hammer, anvils and sparks ──────────────────

const FIRE = "#ff9a3c";
function forgemaster(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.5])) return;
  const fast = e.phase >= 2 ? 0.8 : 1;
  if (e.state === "sparks") {
    if (e.cd3 <= 0) { e.cd3 = 0.07; fire(e, w, e.aim + w.rng.range(-0.6, 0.6), w.rng.range(200, 320), { kind: "pellet", radius: 6, color: "#ffd23c", dmg: 0.5 }); }
    if (e.stateT > 1.6) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "charge") {
    const dir = fromAngle(e.aim), hit = w.moveCircle(e.pos, e.radius, dir.x * 600 * dt, dir.y * 600 * dt);
    if (!e.target && dist(e.pos, p.pos) < e.radius + p.radius) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg * 1.3, e); }
    if (hit.hitX || hit.hitY || e.stateT > 0.8) {
      e.target = undefined;
      if (hit.hitX || hit.hitY) { e.stunT = 1.1; w.shake(10); w.sound("slam"); ringOf(e, w, 14, 180, 0, { kind: "pellet", color: FIRE, from: e.pos }); }
      e.state = "idle"; e.stateT = 0;
    }
    return;
  }
  if (e.state === "chargeWait") { if (e.stateT > 0.8 * fast) { e.state = "charge"; e.stateT = 0; } return; }
  if (e.state === "ring") {
    if (e.counter < 2 && e.stateT > 0.3 + e.counter * 0.45) { ringOf(e, w, 20, 190, e.counter * Math.PI / 20, { color: FIRE }); e.counter++; }
    if (e.stateT > 1.2) { e.state = "idle"; e.stateT = 0; e.cd3 = 5; }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const d = dist(e.pos, p.pos);
  const pick = choose(e, w, dt, 0.9 * fast, [
    ["hammer", 3], ["anvils", 2.5], ["sparks", 2], ["charge", d > 220 ? 2.5 : 0.5], ["ring", e.phase >= 2 && e.cd3 <= 0 ? 3 : 0],
  ], 160);
  if (!pick) return;
  if (pick === "hammer") {
    e.state = "attack";
    const at = { ...p.pos };
    w.hazard({ shape: "circle", pos: at, radius: 110, delay: 0.85 * fast, dmg: e.dmg * 1.4, color: "#ff5a3c", knock: 300, source: e });
    w.hazard({ shape: "circle", pos: at, radius: e.phase >= 2 ? 90 : 70, delay: 0.9 * fast, dmg: e.dmg * 0.25, linger: 3, tick: 0.5, color: FIRE, source: e });
  } else if (pick === "anvils") {
    e.state = "attack";
    for (let i = 0; i < 5; i++) {
      const at = i === 0 ? { ...p.pos } : { x: p.pos.x + w.rng.range(-170, 170), y: p.pos.y + w.rng.range(-130, 130) };
      w.hazard({ shape: "circle", pos: at, radius: 70, delay: (0.8 + i * 0.15) * fast, dmg: e.dmg, color: "#ffd23c", source: e });
    }
  } else if (pick === "sparks") { e.state = "sparks"; e.aim = angleTo(e.pos, p.pos); e.cd3 = 0; w.sound("charge"); }
  else if (pick === "charge") {
    e.state = "chargeWait"; e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 520, width: e.radius * 2 + 12, delay: 0.8 * fast, dmg: 0, color: "#ff5a3c" });
  } else if (pick === "ring") { e.state = "ring"; e.counter = 0; }
}

// ─── The Mother Bloom (depth 18): rooted, blooming, never alone ─────────────

const PETAL = "#ff8fb3", SPORE = "#b9ff6b";
function bloom(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.66, 0.33])) return;
  const fast = e.phase >= 3 ? 0.7 : e.phase >= 2 ? 0.85 : 1;
  if (e.state === "petals") {
    if (e.cd3 <= 0) {
      e.cd3 = 0.12; e.aim += e.phase >= 3 ? 0.19 : 0.15;
      const arms = e.phase >= 3 ? 7 : 5;
      for (let arm = 0; arm < arms; arm++) fire(e, w, e.aim + (arm / arms) * TAU, 150, { radius: 7, color: PETAL, dmg: 0.5 });
    }
    if (e.stateT > 2.4) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const pick = choose(e, w, dt, 0.9 * fast, [
    ["petals", 3], ["spores", 2.5], ["vines", 2.5], ["seedlings", minionsOf(e, w) < 4 && e.minionCd <= 0 ? 2 : 0], ["pollen", e.phase >= 2 ? 2.5 : 0],
  ]);
  if (!pick) return;
  if (pick === "petals") { e.state = "petals"; e.cd3 = 0; e.aim = angleTo(e.pos, p.pos); }
  else if (pick === "spores") {
    e.state = "attack";
    for (let i = 0; i < 3; i++) {
      const at = i === 0 ? { ...p.pos } : { x: p.pos.x + w.rng.range(-180, 180), y: p.pos.y + w.rng.range(-140, 140) };
      w.hazard({ shape: "circle", pos: at, radius: 80, delay: 0.9 * fast, dmg: e.dmg * 0.3, linger: 4, tick: 0.5, color: SPORE, slow: true, source: e });
    }
  } else if (pick === "vines") {
    e.state = "attack";
    const a = angleTo(e.pos, p.pos), spread = e.phase >= 3 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.35, 0, 0.35];
    for (const o of spread) w.hazard({ shape: "line", pos: { ...e.pos }, angle: a + o, length: 640, width: 30, delay: 0.9 * fast, dmg: e.dmg * 1.1, color: "#6ee07a", source: e });
  } else if (pick === "seedlings") {
    e.state = "attack"; e.minionCd = 11; w.sound("summon");
    for (let i = 0; i < 2; i++) w.spawn(i === 1 && e.phase >= 2 ? "thorn" : "sporeling", w.pointNearPlayer(e.roomId, 150, 280), e.roomId, { minion: true });
  } else if (pick === "pollen") { e.state = "attack"; ringOf(e, w, 24, 120, e.anim, { kind: "needle", radius: 6, color: SPORE, slow: true, dmg: 0.5 }); }
}

// ─── The Drowned Cantor (depth 21): tides, bells and the undertow ──────────

const TIDE = "#a8e6ff";
function cantor(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.5])) return;
  const fast = e.phase >= 2 ? 0.8 : 1;
  if (e.state === "hymn") {
    if (e.cd3 <= 0) {
      e.cd3 = 0.07;
      const sway = Math.sin(e.stateT * 6) * 0.6;
      fire(e, w, e.aim + sway, 240, { radius: 6, color: TIDE, dmg: 0.5 });
      fire(e, w, e.aim - sway, 240, { radius: 6, color: TIDE, dmg: 0.5 });
    }
    if (e.stateT > 1.6) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "whirl") {
    if (e.counter === 0 && e.stateT > 0.9) { e.counter = 1; ringOf(e, w, 20, 170, e.anim, { color: TIDE }); }
    if (e.stateT > 1.4) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "sink") {
    e.invulnT = 0.3;
    if (e.stateT > 0.8) { e.pos = w.pointNearPlayer(e.roomId, 220, 320); w.burst(e.pos.x, e.pos.y, TIDE, 24, 200); w.sound("blink"); e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const pick = choose(e, w, dt, 1.0 * fast, [
    ["tide", 3], ["toll", 2.5], ["whirl", 2], ["hymn", 2.5], ["sink", e.phase >= 2 ? 1.5 : 0],
  ], 260);
  if (!pick) return;
  if (pick === "tide") {
    // A wall of water rolls across the room with one gap to swim through.
    e.state = "attack";
    const a = angleTo(e.pos, p.pos), side = fromAngle(a + Math.PI / 2), gap = w.rng.int(3, 12), waves = e.phase >= 2 ? 2 : 1;
    for (let v = 0; v < waves; v++) for (let i = 0; i < 16; i++) {
      if (Math.abs(i - gap - v * 2) <= 1) continue;
      const o = (i - 7.5) * 52;
      fire(e, w, a, 140 - v * 25, { radius: 9, color: TIDE, from: { x: e.pos.x + side.x * o, y: e.pos.y + side.y * o } });
    }
  } else if (pick === "toll") {
    e.state = "attack"; w.sound("summon");
    w.hazard({ shape: "ring", pos: { ...e.pos }, radius: 170, delay: 0.8 * fast, dmg: e.dmg, color: "#7fd4ff", source: e });
    ringOf(e, w, 16, 150, 0, { color: TIDE, from: e.pos });
  } else if (pick === "whirl") {
    // The undertow drags you toward the Cantor, then a ring breaks outward.
    e.state = "whirl"; e.counter = 0;
    w.hazard({ shape: "ring", pos: { ...e.pos }, radius: 620, delay: 0.5, dmg: 0, color: "#3ef0ff", knock: -420 });
  } else if (pick === "hymn") { e.state = "hymn"; e.aim = angleTo(e.pos, p.pos); e.cd3 = 0; }
  else if (pick === "sink") { e.state = "sink"; w.burst(e.pos.x, e.pos.y, TIDE, 24, 200); }
}

// ─── The Hour Engine (depth 24): the clock at the heart of the tomb ─────────

const BRASS = "#ffd23c";
function hourengine(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.66, 0.33])) return;
  const fast = e.phase >= 3 ? 0.7 : e.phase >= 2 ? 0.85 : 1;
  // From phase 2 the engine's gears shed a slow three-arm spiral between attacks.
  if (e.phase >= 2) {
    if (e.cd2 <= 0) { e.cd2 = 0.3; e.aim += 0.3; for (let arm = 0; arm < 3; arm++) fire(e, w, e.aim + (arm / 3) * TAU, 120, { kind: "pellet", radius: 6, color: "#e6ff8a", dmg: 0.4, from: e.pos }); }
  }
  if (e.state === "chime") {
    if (e.counter < 3 && e.stateT > 0.25 + e.counter * 0.4) { ringOf(e, w, 18, 180, e.counter * 0.17, { color: BRASS, from: e.pos }); e.counter++; }
    if (e.stateT > 1.5) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const pick = choose(e, w, dt, 1.0 * fast, [["hands", e.cd3 <= 0 ? 3 : 0], ["tick", 2.5], ["gears", 2.5], ["chime", e.phase >= 3 ? 3 : 1]]);
  if (!pick) return;
  if (pick === "hands") {
    // The clock's hands: long beams that sweep around the room.
    e.state = "attack"; e.cd3 = 6; w.sound("charge");
    const a = angleTo(e.pos, p.pos);
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: a + 1.2, length: 760, width: 30, delay: 1.0, dmg: e.dmg * 0.5, linger: 3.2, tick: 0.25, color: BRASS, sweep: -0.75, source: e });
    if (e.phase >= 2) w.hazard({ shape: "line", pos: { ...e.pos }, angle: a - 2, length: 520, width: 24, delay: 1.0, dmg: e.dmg * 0.5, linger: 3.2, tick: 0.25, color: "#ccff00", sweep: 1.3, source: e });
  } else if (pick === "tick") {
    // Twelve marks around the engine go off in turn, like a second hand.
    e.state = "attack";
    const start = angleTo(e.pos, p.pos) - Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = start + (i / 12) * TAU;
      w.hazard({ shape: "circle", pos: { x: e.pos.x + Math.cos(a) * 210, y: e.pos.y + Math.sin(a) * 210 }, radius: 58, delay: (0.8 + i * 0.12) * fast, dmg: e.dmg, color: BRASS, source: e });
    }
  } else if (pick === "gears") {
    e.state = "attack";
    const a = angleTo(e.pos, p.pos);
    for (let i = -1; i <= 1; i++) {
      const target = { x: p.pos.x + Math.cos(a + i * 0.9) * 90, y: p.pos.y + Math.sin(a + i * 0.9) * 90 };
      const d = Math.max(80, dist(e.pos, target)), speed = 260;
      w.fire({ pos: { ...e.pos }, vel: fromAngle(angleTo(e.pos, target), speed), radius: 12, dmg: e.dmg * 0.8, owner: "enemy", life: d / speed, color: BRASS, kind: "glob", source: e,
        burst: { count: 8, speed: 150, color: "#e6ff8a", dmg: e.dmg * 0.5 } });
      w.hazard({ shape: "circle", pos: target, radius: 40, delay: d / speed, dmg: 0, color: BRASS });
    }
  } else if (pick === "chime") { e.state = "chime"; e.counter = 0; w.sound("summon"); }
}

// ─── The Reflection (depth 27): you, in the glass ───────────────────────────

const GLASS = "#f3eeff";
function reflection(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.5])) return;
  const fast = e.phase >= 2 ? 0.8 : 1;
  const kit = w.mirrorKit;
  if (e.state === "echo") {
    // Your bolt, turned back on you.
    const volleys = 3;
    if (e.counter < volleys && e.stateT > e.counter * 0.28) {
      const a = angleTo(e.pos, p.pos);
      if (kit.bolt === "shards") for (let i = -2; i <= 2; i++) fire(e, w, a + i * 0.2, 300, { kind: "shard", radius: 6, color: GLASS });
      else if (kit.bolt === "lance") fire(e, w, a, 560, { kind: "needle", radius: 8, color: GLASS, dmg: 1 });
      else { fire(e, w, a, 420, { radius: 7, color: GLASS, dmg: 0.8 }); fire(e, w, a + 0.12, 420, { radius: 7, color: GLASS, dmg: 0.8 }); }
      e.counter++;
    }
    if (e.stateT > 1.1) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "mirrorDash") {
    if (e.stateT > 0.4) {
      // It steps to where your mirror image would stand, across the room from you.
      const r = w.roomRect(e.roomId), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const to = { x: Math.max(r.x + 60, Math.min(r.x + r.w - 60, cx * 2 - p.pos.x)), y: Math.max(r.y + 60, Math.min(r.y + r.h - 60, cy * 2 - p.pos.y)) };
      w.burst(e.pos.x, e.pos.y, GLASS, 20, 220); e.pos = to; w.burst(to.x, to.y, GLASS, 20, 220); w.sound("blink");
      const a = angleTo(e.pos, p.pos);
      for (let i = -3; i <= 3; i++) fire(e, w, a + i * 0.16, 260, { kind: "shard", radius: 6, color: GLASS });
      e.state = "idle"; e.stateT = 0;
    }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const pick = choose(e, w, dt, 0.9 * fast, [
    ["echo", 3], ["signature", 2.5], ["mirrorDash", 2], ["shatter", e.phase >= 2 && minionsOf(e, w) < 2 && e.minionCd <= 0 ? 3 : 0],
  ], 200);
  if (!pick) return;
  if (pick === "echo") { e.state = "echo"; e.counter = 0; }
  else if (pick === "mirrorDash") { e.state = "mirrorDash"; }
  else if (pick === "shatter") {
    // Two false reflections step out of the glass. They break in a few hits.
    e.state = "attack"; e.minionCd = 12; w.sound("summon");
    for (let i = 0; i < 2; i++) w.spawn("reflection", w.pointNearPlayer(e.roomId, 160, 260), e.roomId, { minion: true });
  } else if (pick === "signature") { e.state = "attack"; castSignature(e, w, kit.signature); }
}

/** The Reflection's version of your family's signature ability. */
function castSignature(e: Enemy, w: World, signature: string) {
  const p = w.player, a = angleTo(e.pos, p.pos), color = "#dcb8ff";
  switch (signature) {
    case "boneSpikes": for (const o of [-0.35, 0, 0.35]) w.hazard({ shape: "line", pos: { ...e.pos }, angle: a + o, length: 300, width: 36, delay: 0.7, dmg: e.dmg, color, source: e }); break;
    case "masquerade": e.invulnT = 1.5; ringOf(e, w, 12, 220, a, { kind: "shard", color }); break;
    case "rally": e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03); w.hazard({ shape: "ring", pos: { ...e.pos }, radius: 200, delay: 0.4, dmg: 0, color, knock: 420 }); break;
    case "mitosis": ringOf(e, w, 8, 380, a, { radius: 9, color }); break;
    case "chaosRift": for (let i = 0; i < 4; i++) w.hazard({ shape: "circle", pos: { x: p.pos.x + w.rng.range(-110, 110), y: p.pos.y + w.rng.range(-90, 90) }, radius: 80, delay: 0.7 + i * 0.12, dmg: e.dmg, color, source: e }); break;
    case "phaseBlink": w.burst(e.pos.x, e.pos.y, color, 20, 200); e.pos = w.pointNearPlayer(e.roomId, 90, 140); w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 100, delay: 0.5, dmg: e.dmg, color, source: e }); w.sound("blink"); break;
    case "earthshatter": w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 200, delay: 1.1, dmg: e.dmg * 1.6, color, knock: 400, source: e }); break;
    case "prismBurst": ringOf(e, w, 12, 420, a, { radius: 7, color: "#ff8fb3" }); break;
    case "voidPull":
      w.hazard({ shape: "ring", pos: { ...e.pos }, radius: 520, delay: 0.3, dmg: 0, color, knock: -380 });
      w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 130, delay: 0.9, dmg: e.dmg * 1.2, color, source: e }); break;
    default: w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 150, delay: 0.7, dmg: e.dmg, color, source: e });
  }
}

/** A false reflection: circles you and throws glass until it breaks. */
function decoy(e: Enemy, w: World, dt: number) {
  const p = w.player;
  const around = angleTo(p.pos, e.pos) + dt * 0.8;
  steer(e, w, { x: p.pos.x + Math.cos(around) * 220, y: p.pos.y + Math.sin(around) * 220 }, e.speed * 0.8, dt);
  if (e.cd <= 0) { e.cd = 2.2; const a = angleTo(e.pos, p.pos); for (let i = -1; i <= 1; i++) fire(e, w, a + i * 0.2, 240, { kind: "shard", radius: 6, color: GLASS, dmg: 0.5 }); }
}

// ─── The First Friend (depth 30): the bottom of the Descent ─────────────────

const GENESIS = "#ffffff", GOLD = "#ffd23c";
const ECHOES: readonly EnemyKind[] = ["cursed", "wisp", "drone", "bloodling", "frostmoth", "cinderimp", "sporeling", "eel", "shardling", "seraph"];
function firstfriend(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (common(e, w, dt, [0.66, 0.33])) return;
  const fast = e.phase >= 3 ? 0.7 : e.phase >= 2 ? 0.85 : 1;
  if (e.state === "genesis") {
    if (e.counter < 3 && e.stateT > 0.2 + e.counter * 0.4) { ringOf(e, w, 18 + e.phase * 2, 170, e.counter * 0.18, { color: e.counter % 2 ? GOLD : GENESIS, from: e.pos }); e.counter++; }
    if (e.stateT > 1.5) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "mint") {
    if (e.cd3 <= 0) {
      e.cd3 = 0.09; e.aim += 0.21;
      const arms = e.phase >= 3 ? 4 : 2;
      for (let arm = 0; arm < arms; arm++) fire(e, w, e.aim + (arm / arms) * TAU, 160, { kind: arm % 2 ? "pellet" : "orb", radius: 7, color: arm % 2 ? GOLD : GENESIS, dmg: 0.5, from: e.pos });
    }
    if (e.stateT > 2.4) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state === "curtain") {
    if (e.counter < 3 && e.stateT > e.counter * 0.6) {
      const a = angleTo(e.pos, p.pos), side = fromAngle(a + Math.PI / 2), gap = w.rng.int(3, 11);
      for (let i = 0; i < 15; i++) {
        if (Math.abs(i - gap) <= 1) continue;
        const o = (i - 7) * 48;
        fire(e, w, a, 150, { radius: 8, color: e.counter % 2 ? GOLD : GENESIS, from: { x: e.pos.x + side.x * o, y: e.pos.y + side.y * o } });
      }
      e.counter++;
    }
    if (e.stateT > 1.8) { e.state = "idle"; e.stateT = 0; }
    return;
  }
  if (e.state !== "idle") { e.state = "idle"; e.stateT = 0; }
  const pick = choose(e, w, dt, 0.9 * fast, [
    ["genesis", 3], ["cross", e.cd3 <= 0 ? 2.5 : 0], ["mint", 2.5], ["call", minionsOf(e, w) < 4 && e.minionCd <= 0 ? 2 : 0],
    ["curtain", e.phase >= 2 ? 2.5 : 0], ["judgement", e.phase >= 3 ? 3 : 0], ["blink", dist(e.pos, p.pos) > 360 ? 1.5 : 0],
  ], 240);
  if (!pick) return;
  if (pick === "genesis") { e.state = "genesis"; e.counter = 0; w.sound("summon"); }
  else if (pick === "cross") {
    e.state = "attack"; e.cd3 = 6;
    const beams = e.phase >= 2 ? 6 : 4, a = angleTo(e.pos, p.pos) + Math.PI / beams;
    for (let i = 0; i < beams; i++) w.hazard({ shape: "line", pos: { ...e.pos }, angle: a + (i / beams) * TAU, length: 700, width: 26, delay: 1.0, dmg: e.dmg * 0.5, linger: 2.8, tick: 0.25, color: GENESIS, sweep: e.phase >= 3 ? 0.8 : 0.55, source: e });
  } else if (pick === "mint") { e.state = "mint"; e.cd3 = 0; e.aim = angleTo(e.pos, p.pos); }
  else if (pick === "call") {
    // It calls up creatures from every act you passed through.
    e.state = "attack"; e.minionCd = 11; w.sound("summon");
    for (let i = 0; i < 2; i++) w.spawn(ECHOES[w.rng.int(0, ECHOES.length - 1)], w.pointNearPlayer(e.roomId, 150, 280), e.roomId, { minion: true });
  } else if (pick === "curtain") { e.state = "curtain"; e.counter = 0; }
  else if (pick === "judgement") {
    e.state = "attack";
    for (let i = 0; i < 3; i++) w.hazard({ shape: "circle", pos: { x: p.pos.x + w.rng.range(-40, 40), y: p.pos.y + w.rng.range(-40, 40) }, radius: 110, delay: (0.8 + i * 0.35) * fast, dmg: e.dmg * 1.3, color: GOLD, knock: 240, source: e });
    ringOf(e, w, 24, 140, e.anim, { kind: "needle", radius: 6, color: GENESIS, from: e.pos, dmg: 0.5 });
  } else if (pick === "blink") {
    e.state = "attack";
    w.burst(e.pos.x, e.pos.y, GENESIS, 30, 260); e.pos = w.pointNearPlayer(e.roomId, 200, 280); w.burst(e.pos.x, e.pos.y, GENESIS, 30, 260); w.sound("blink");
  }
}
