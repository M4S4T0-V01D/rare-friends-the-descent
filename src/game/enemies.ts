import type { Enemy, EnemyKind, Hazard, Modifier, Player, Projectile } from "./entities";
import type { Rect } from "./dungeon";
import { angleTo, dist, fromAngle, inCone, normalize, TAU, type Vec } from "./math";
import type { Rng } from "./rng";

/** What enemy AI may ask of the world. The Game implements it. */
export interface World {
  readonly player: Player;
  readonly time: number;
  readonly depth: number;
  readonly rng: Rng;
  readonly enemies: readonly Enemy[];
  moveCircle(pos: Vec, radius: number, dx: number, dy: number): { hitX: boolean; hitY: boolean };
  los(a: Vec, b: Vec): boolean;
  flow(pos: Vec): Vec | null;
  roomRect(roomId: number): Rect;
  pointNearPlayer(roomId: number, min: number, max: number): Vec;
  fire(projectile: Omit<Projectile, "id" | "hit" | "pierce"> & { pierce?: number }): void;
  hazard(hazard: Partial<Hazard> & Pick<Hazard, "shape" | "pos" | "delay" | "dmg">): void;
  spawn(kind: EnemyKind, pos: Vec, roomId: number, options?: SpawnOptions): Enemy;
  hurtPlayer(amount: number, source: Enemy | null, options?: { slow?: boolean; curse?: boolean }): void;
  burst(x: number, y: number, color: string, count: number, speed?: number): void;
  shake(amount: number): void;
  sound(name: string): void;
  dropGoblinCoin(enemy: Enemy): void;
  toast(text: string, color?: string): void;
}

export type SpawnOptions = { elite?: boolean; champion?: boolean; mods?: Modifier[]; variant?: number; minion?: boolean };

export const MODIFIER_INFO: Readonly<Record<Modifier, { label: string; color: string }>> = {
  vampiric: { label: "Vampiric", color: "#ff2e4d" },
  explosive: { label: "Explosive", color: "#ff9a3c" },
  frozen: { label: "Frozen", color: "#8fe3ff" },
  swarm: { label: "Swarm", color: "#b9ff6b" },
  frenzied: { label: "Frenzied", color: "#ffd23c" },
  armored: { label: "Armored", color: "#9aa3b8" },
  teleporting: { label: "Teleporting", color: "#bb66ff" },
  cursed: { label: "Cursed", color: "#7a2cff" },
};
export const ALL_MODIFIERS = Object.keys(MODIFIER_INFO) as Modifier[];

const BASE: Readonly<Record<EnemyKind, { name: string; hp: number; dmg: number; speed: number; radius: number; xp: number }>> = {
  cursed: { name: "CURSED FRIEND", hp: 38, dmg: 11, speed: 150, radius: 13, xp: 7 },
  crawler: { name: "VOID CRAWLER", hp: 26, dmg: 9, speed: 110, radius: 13, xp: 8 },
  goblin: { name: "LOOT GOBLIN", hp: 70, dmg: 0, speed: 190, radius: 13, xp: 25 },
  corrupted: { name: "CORRUPTED FRIEND", hp: 190, dmg: 18, speed: 125, radius: 20, xp: 45 },
  warden: { name: "DUNGEON WARDEN", hp: 1100, dmg: 24, speed: 95, radius: 40, xp: 260 },
  beast: { name: "THE RARE BEAST", hp: 9500, dmg: 30, speed: 112, radius: 56, xp: 700 },
  unminted: { name: "THE UNMINTED", hp: 1000, dmg: 26, speed: 120, radius: 34, xp: 420 },
};

export const hpScale = (depth: number) => 1 + 0.42 * (depth - 1) + 0.06 * (depth - 1) ** 2;
export const dmgScale = (depth: number) => 1 + 0.33 * (depth - 1);

let nextEnemyId = 1;
export function createEnemy(kind: EnemyKind, pos: Vec, depth: number, roomId: number, rng: Rng, options: SpawnOptions = {}): Enemy {
  const base = BASE[kind];
  const boss = kind === "warden" || kind === "beast" || kind === "unminted";
  let hp = base.hp, dmg = base.dmg * dmgScale(depth), speed = base.speed, name = base.name, radius = base.radius;
  if (kind === "warden") {
    hp = depth >= 6 ? 3800 : 1400;
    if (depth >= 6) name = "WARDEN OF THE DEEP";
    if (depth > 9) hp *= hpScale(depth) / hpScale(9);
  } else if (kind === "beast") {
    if (depth > 9) hp *= hpScale(depth) / hpScale(9);
  } else if (kind === "unminted") {
    hp = 1000 + 520 * depth;
  } else hp *= hpScale(depth);
  const mods = [...(options.mods ?? [])];
  if (options.champion) { hp *= 1.5; radius += 2; }
  if (options.minion) { hp *= 0.6; dmg *= 0.8; }
  if (mods.includes("armored")) hp *= 1.6;
  if (mods.includes("frenzied")) speed *= 1.35;
  if (mods.length && !boss) name = `${mods.map(mod => MODIFIER_INFO[mod].label).join(" ")} ${name}`;
  hp = Math.round(hp);
  return {
    id: nextEnemyId++, kind, name, pos: { ...pos }, vel: { x: 0, y: 0 }, radius, hp, maxHp: hp, dmg, speed,
    xp: Math.round(base.xp * (1 + 0.1 * (depth - 1)) * (options.elite ? 1 : options.champion ? 1.6 : 1)),
    elite: options.elite ?? kind === "corrupted", champion: options.champion ?? false, boss, mods,
    roomId, spawnT: boss ? 0 : 0.6, dead: false, state: "idle", stateT: 0,
    cd: rng.range(0.4, 1.4), cd2: rng.range(3, 5), cd3: rng.range(5, 8), aim: 0,
    hitFlash: 0, knock: { x: 0, y: 0 }, burnT: 0, burnDps: 0, burnTick: 0, seed: rng.int(0, 1e6), phase: 1, anim: 0,
    coins: 0, fleeT: 0, counter: 0, orbitHitT: 0, minionCd: 6, teleportCd: rng.range(3, 5), stunT: 0, invulnT: 0,
  };
}

/** Pick a modifier set, avoiding duplicates. */
export function rollModifiers(rng: Rng, count: number): Modifier[] {
  return rng.shuffle([...ALL_MODIFIERS]).slice(0, count);
}

const playerReach = (e: Enemy, p: Player) => e.radius + p.radius + 16;

function steer(e: Enemy, w: World, target: Vec, speed: number, dt: number) {
  let dir = normalize(target.x - e.pos.x, target.y - e.pos.y);
  if (!w.los(e.pos, target)) dir = w.flow(e.pos) ?? dir;
  e.vel.x = dir.x * speed;
  e.vel.y = dir.y * speed;
  w.moveCircle(e.pos, e.radius, e.vel.x * dt, e.vel.y * dt);
}

function attackTempo(e: Enemy) { return e.mods.includes("frenzied") ? 0.7 : 1; }

/** Advance one enemy. Damage from telegraphed attacks resolves through hazards in the Game. */
export function updateEnemy(e: Enemy, w: World, dt: number) {
  const p = w.player;
  e.anim += dt;
  e.stateT += dt;
  e.cd -= dt; e.cd2 -= dt; e.cd3 -= dt; e.minionCd -= dt; e.teleportCd -= dt;
  resolvePending(e);
  if (e.stunT > 0) { e.stunT -= dt; return; }
  if (e.mods.includes("teleporting") && e.teleportCd <= 0 && !e.boss && dist(e.pos, p.pos) > 110 && e.state !== "blink") {
    e.state = "blink"; e.stateT = 0; e.teleportCd = w.rng.range(4, 5.5);
  }
  if (e.state === "blink") {
    if (e.stateT > 0.4) {
      w.burst(e.pos.x, e.pos.y, "#bb66ff", 10);
      e.pos = w.pointNearPlayer(e.roomId, 100, 170);
      w.burst(e.pos.x, e.pos.y, "#bb66ff", 14);
      w.sound("blink");
      e.state = "chase"; e.stateT = 0; e.cd = Math.max(e.cd, 0.5);
    }
    return;
  }
  if (e.mods.includes("swarm") && e.elite && e.minionCd <= 0 && w.enemies.filter(o => !o.dead && o.roomId === e.roomId).length < 12) {
    e.minionCd = 9;
    for (let i = 0; i < 2; i++) w.spawn("cursed", w.pointNearPlayer(e.roomId, 90, 220), e.roomId, { minion: true });
  }
  switch (e.kind) {
    case "cursed": return melee(e, w, dt, 0.32, 95, 46);
    case "crawler": return crawler(e, w, dt);
    case "goblin": return goblin(e, w, dt);
    case "corrupted": return corrupted(e, w, dt);
    case "warden": return warden(e, w, dt);
    case "beast": return beast(e, w, dt);
    case "unminted": return unminted(e, w, dt);
  }
  void p;
}

function melee(e: Enemy, w: World, dt: number, windup: number, arcDeg: number, range: number) {
  const p = w.player, tempo = attackTempo(e);
  const d = dist(e.pos, p.pos);
  if (e.state === "idle" || e.state === "chase") {
    e.state = "chase";
    if (d <= playerReach(e, p) && e.cd <= 0) { e.state = "windup"; e.stateT = 0; e.aim = angleTo(e.pos, p.pos); e.vel = { x: 0, y: 0 }; }
    else steer(e, w, p.pos, e.speed, dt);
  } else if (e.state === "windup") {
    if (e.stateT >= windup * tempo) {
      if (inCone(e.pos, e.aim, (arcDeg * Math.PI) / 180, range + e.radius, p.pos, p.radius)) {
        w.hurtPlayer(e.dmg, e, { slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed") });
      }
      w.sound("enemySwing");
      e.state = "recover"; e.stateT = 0; e.cd = 1.0 * tempo;
    }
  } else if (e.state === "recover") {
    if (e.stateT >= 0.42 * tempo) { e.state = "chase"; e.stateT = 0; }
  }
}

function crawler(e: Enemy, w: World, dt: number) {
  const p = w.player, d = dist(e.pos, p.pos), tempo = attackTempo(e);
  if (e.state === "aim") {
    if (e.stateT >= 0.45 * tempo) {
      const base = angleTo(e.pos, p.pos);
      const shots = w.depth >= 5 ? 3 : w.depth >= 3 ? 2 : 1;
      for (let i = 0; i < shots; i++) {
        const angle = base + (i - (shots - 1) / 2) * 0.22;
        w.fire({ pos: { ...e.pos }, vel: fromAngle(angle, 200 + w.depth * 8), radius: 8, dmg: e.dmg, owner: "enemy", life: 4, color: "#bb66ff",
          kind: "orb", source: e, slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed") });
      }
      w.sound("enemyShot");
      e.state = "move"; e.stateT = 0; e.cd = (2.1 + w.rng.range(0, 0.6)) * tempo;
    }
    return;
  }
  e.state = "move";
  if (e.cd <= 0 && d < 520 && w.los(e.pos, p.pos)) { e.state = "aim"; e.stateT = 0; e.vel = { x: 0, y: 0 }; return; }
  let target: Vec;
  // Crawlers only back off when you are close, and slowly, so melee builds can catch them.
  if (d < 150) target = { x: e.pos.x - (p.pos.x - e.pos.x), y: e.pos.y - (p.pos.y - e.pos.y) };
  else if (d > 330) target = p.pos;
  else {
    const around = angleTo(p.pos, e.pos) + (e.seed % 2 ? 1 : -1) * 0.9;
    target = { x: p.pos.x + Math.cos(around) * 270, y: p.pos.y + Math.sin(around) * 270 };
  }
  const dir = normalize(target.x - e.pos.x, target.y - e.pos.y);
  const speed = d < 150 ? e.speed * 0.75 : e.speed;
  const hit = w.moveCircle(e.pos, e.radius, dir.x * speed * dt, dir.y * speed * dt);
  if (hit.hitX || hit.hitY) e.seed++;
}

function goblin(e: Enemy, w: World, dt: number) {
  const p = w.player;
  e.fleeT += dt;
  if (e.fleeT > 14) {
    w.burst(e.pos.x, e.pos.y, "#ccff00", 30, 200);
    w.toast("The Loot Goblin escaped through a rift!", "#ccff00");
    w.sound("blink");
    e.dead = true; e.hp = 0; e.state = "escaped";
    return;
  }
  if (e.cd <= 0 && e.coins < 3) { e.cd = 2.6; e.coins++; w.dropGoblinCoin(e); }
  // Choose the open direction that best increases distance from the player.
  if (e.stateT > 0.25 || !e.target) {
    e.stateT = 0;
    let best = -Infinity;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * TAU + w.rng.range(-0.1, 0.1);
      const probe = { x: e.pos.x + Math.cos(angle) * 90, y: e.pos.y + Math.sin(angle) * 90 };
      if (!w.los(e.pos, probe)) continue;
      const score = dist(probe, p.pos) + w.rng.range(0, 30);
      if (score > best) { best = score; e.target = probe; }
    }
  }
  if (e.target) {
    const dir = normalize(e.target.x - e.pos.x, e.target.y - e.pos.y);
    const speed = dist(e.pos, p.pos) < 260 ? e.speed : e.speed * 0.55;
    w.moveCircle(e.pos, e.radius, dir.x * speed * dt, dir.y * speed * dt);
  }
}

function corrupted(e: Enemy, w: World, dt: number) {
  const p = w.player, tempo = attackTempo(e), d = dist(e.pos, p.pos);
  if (e.state === "chargeAim") {
    if (e.stateT >= 0.7 * tempo) { e.state = "charge"; e.stateT = 0; w.sound("charge"); }
    return;
  }
  if (e.state === "charge") {
    const dir = fromAngle(e.aim);
    const hit = w.moveCircle(e.pos, e.radius, dir.x * 560 * dt, dir.y * 560 * dt);
    if (dist(e.pos, p.pos) < e.radius + p.radius + 4 && !e.target) { e.target = { x: 1, y: 1 }; w.hurtPlayer(e.dmg * 1.2, e, { slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed") }); }
    if (e.stateT > 0.5 || hit.hitX || hit.hitY) { e.state = "recover"; e.stateT = 0; e.target = undefined; if (hit.hitX || hit.hitY) { w.shake(4); w.burst(e.pos.x, e.pos.y, "#9a7fd1", 8); } }
    return;
  }
  if (e.state === "slam") {
    if (e.stateT >= 0.9 * tempo) { e.state = "recover"; e.stateT = 0; }
    return;
  }
  if (e.state === "windup" || e.state === "recover") return melee(e, w, dt, 0.45, 110, 58);
  e.state = "chase";
  if (e.cd2 <= 0 && d > 140 && d < 460 && w.los(e.pos, p.pos)) {
    e.state = "chargeAim"; e.stateT = 0; e.cd2 = 5 * tempo; e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 300, width: e.radius * 2 + 10, delay: 0.7 * tempo, dmg: 0, color: "#ff2e4d" });
    return;
  }
  if (e.cd3 <= 0 && d < 150) {
    e.state = "slam"; e.stateT = 0; e.cd3 = 6.5 * tempo;
    w.hazard({ shape: "circle", pos: { ...e.pos }, radius: 95, delay: 0.8 * tempo, dmg: e.dmg * 1.3, color: "#ff2e4d", source: e,
      slow: e.mods.includes("frozen"), curse: e.mods.includes("cursed"), knock: 260 });
    return;
  }
  melee(e, w, dt, 0.45, 110, 58);
}

function bossPhase(e: Enemy, w: World, thresholds: number[]) {
  const ratio = e.hp / e.maxHp;
  const next = thresholds.filter(t => ratio <= t).length + 1;
  if (next > e.phase) {
    e.phase = next; e.invulnT = 1.2; e.state = "roar"; e.stateT = 0;
    w.sound("roar"); w.shake(12);
    w.hazard({ shape: "ring", pos: { ...e.pos }, radius: 240, delay: 0.25, dmg: 0, color: "#ff3d7f", knock: 420 });
    w.toast(`${e.name} — PHASE ${e.phase}`, "#ff3d7f");
    return true;
  }
  return false;
}

function warden(e: Enemy, w: World, dt: number) {
  const p = w.player, deep = w.depth >= 6;
  if (e.invulnT > 0) e.invulnT -= dt;
  if (bossPhase(e, w, [0.5])) return;
  const fast = e.phase >= 2 ? 0.8 : 1;
  switch (e.state) {
    case "roar": if (e.stateT > 1.1) { e.state = "idle"; e.stateT = 0; } return;
    case "charge": {
      const dir = fromAngle(e.aim);
      const hit = w.moveCircle(e.pos, e.radius, dir.x * 620 * dt, dir.y * 620 * dt);
      if (dist(e.pos, p.pos) < e.radius + p.radius && !e.target) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg * 1.3, e); }
      if (hit.hitX || hit.hitY || e.stateT > 0.75) {
        e.target = undefined;
        if (hit.hitX || hit.hitY) { e.stunT = 1.3; w.shake(10); w.sound("slam"); w.burst(e.pos.x, e.pos.y, "#c9b8ff", 24, 260); w.toast("The Warden is stunned!", "#c9b8ff"); }
        e.state = "idle"; e.stateT = 0;
      }
      return;
    }
    case "attack": if (e.stateT > 1.0 * fast) { e.state = "idle"; e.stateT = 0; } return;
    case "ring": {
      const count = deep ? 18 : 14;
      const volley = (offset: number) => {
        for (let i = 0; i < count; i++) w.fire({ pos: { ...e.pos }, vel: fromAngle((i / count) * TAU + offset, 210), radius: 9, dmg: e.dmg * 0.7, owner: "enemy",
          life: 4, color: deep ? "#8fe3ff" : "#c9b8ff", kind: "orb", slow: deep, source: e });
        w.sound("enemyShot");
      };
      if (e.counter === 0 && e.stateT > 0.25) { volley(0); e.counter = 1; }
      else if (e.counter === 1 && e.stateT > 0.7) { volley(Math.PI / count); e.counter = 2; }
      else if (e.counter === 2 && e.stateT > 1.1) { e.state = "idle"; e.stateT = 0; e.cd3 = 5.5 * fast; }
      return;
    }
    case "chargeWait": return;
    case "blink": {
      if (e.stateT > 0.45) {
        w.burst(e.pos.x, e.pos.y, "#8fe3ff", 20);
        e.pos = w.pointNearPlayer(e.roomId, 150, 230);
        w.burst(e.pos.x, e.pos.y, "#8fe3ff", 20); w.sound("blink");
        e.state = "idle"; e.stateT = 0;
      }
      return;
    }
  }
  // Idle: walk toward the player briefly, then choose an attack.
  steer(e, w, p.pos, e.speed * (e.phase >= 2 ? 1.25 : 1), dt);
  if (e.stateT < 0.9 * fast) return;
  const d = dist(e.pos, p.pos);
  const options: [string, number][] = [
    ["slam", 3], ["sweep", d < 240 ? 4 : 1], ["charge", d > 200 ? 3 : 1],
    ["summon", e.minionCd <= 0 ? 2.5 : 0], ["ring", (e.phase >= 2 || deep) && e.cd3 <= 0 ? 3.5 : 0],
    ["blink", deep && d > 260 ? 2 : 0],
  ];
  const pick = w.rng.weighted(options);
  e.stateT = 0;
  if (pick === "slam") {
    e.state = "attack";
    w.hazard({ shape: "circle", pos: { ...p.pos }, radius: 110, delay: 0.9 * fast, dmg: e.dmg * 1.4, color: "#ff2e4d", source: e, knock: 300, slow: deep });
    if (e.phase >= 2) w.hazard({ shape: "circle", pos: { x: p.pos.x + w.rng.range(-160, 160), y: p.pos.y + w.rng.range(-120, 120) }, radius: 90, delay: 1.2 * fast, dmg: e.dmg, color: "#ff2e4d", source: e });
  } else if (pick === "sweep") {
    e.state = "attack";
    e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "cone", pos: { ...e.pos }, angle: e.aim, arc: 1.9, radius: 230, delay: 0.75 * fast, dmg: e.dmg * 1.2, color: "#ff2e4d", source: e, knock: 240 });
  } else if (pick === "charge") {
    e.aim = angleTo(e.pos, p.pos);
    e.state = "chargeWait";
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 520, width: e.radius * 2 + 16, delay: 0.85 * fast, dmg: 0, color: "#ff2e4d" });
    setStateAfter(e, "charge", 0.85 * fast);
  } else if (pick === "summon") {
    e.state = "attack"; e.minionCd = 13;
    w.sound("summon");
    const count = e.phase >= 2 ? 3 : 2;
    for (let i = 0; i < count; i++) w.spawn(deep && i === 0 ? "crawler" : "cursed", w.pointNearPlayer(e.roomId, 140, 280), e.roomId, { minion: true });
  } else if (pick === "ring") {
    e.state = "ring"; e.counter = 0;
  } else if (pick === "blink") {
    e.state = "blink";
  }
}

/** A tiny scheduler for "telegraph, then act" transitions without extra state names. */
function setStateAfter(e: Enemy, next: string, delay: number) {
  e.cd2 = delay;
  e.target = undefined;
  (e as Enemy & { pending?: string }).pending = next;
}
export function resolvePending(e: Enemy) {
  const pending = (e as Enemy & { pending?: string }).pending;
  if (pending && e.cd2 <= 0) { e.state = pending; e.stateT = 0; (e as Enemy & { pending?: string }).pending = undefined; }
}

function beast(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (e.invulnT > 0) e.invulnT -= dt;
  if (bossPhase(e, w, [0.66, 0.33])) return;
  const tempo = e.phase === 3 ? 0.75 : e.phase === 2 ? 0.88 : 1;
  switch (e.state) {
    case "roar": if (e.stateT > 1.2) { e.state = "idle"; e.stateT = 0; } return;
    case "spiral": {
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = e.phase === 3 ? 0.06 : 0.08;
        e.aim += 0.38;
        const arms = e.phase >= 2 ? 2 : 1;
        for (let arm = 0; arm < arms; arm++) w.fire({ pos: { ...e.pos }, vel: fromAngle(e.aim + arm * Math.PI, 190), radius: 9, dmg: e.dmg * 0.55, owner: "enemy",
          life: 4.5, color: "#ccff00", kind: "orb", source: e });
      }
      if (e.stateT > 2.2) { e.state = "idle"; e.stateT = 0; }
      return;
    }
    case "charge": {
      const dir = fromAngle(e.aim);
      const hit = w.moveCircle(e.pos, e.radius, dir.x * 700 * dt, dir.y * 700 * dt);
      if (dist(e.pos, p.pos) < e.radius + p.radius && !e.target) { e.target = { x: 0, y: 0 }; w.hurtPlayer(e.dmg * 1.4, e); }
      if (hit.hitX || hit.hitY || e.stateT > 0.7) {
        e.target = undefined;
        if (hit.hitX || hit.hitY) { e.stunT = 0.9; w.shake(12); w.sound("slam"); w.burst(e.pos.x, e.pos.y, "#ccff00", 26, 280); }
        e.state = "idle"; e.stateT = 0;
      }
      return;
    }
    case "attack": if (e.stateT > 1.05 * tempo) { e.state = "idle"; e.stateT = 0; } return;
    case "chargeWait": return;
  }
  steer(e, w, p.pos, e.speed * (e.phase === 3 ? 1.2 : 1), dt);
  if (e.stateT < 0.8 * tempo) return;
  const d = dist(e.pos, p.pos);
  const pick = w.rng.weighted<string>([
    ["claw", d < 280 ? 4 : 0.5], ["spiral", 2.5], ["stomp", 3],
    ["summon", e.phase >= 2 && e.minionCd <= 0 ? 2 : 0], ["charge", e.phase >= 2 && d > 220 ? 3 : 0],
    ["pools", e.phase >= 3 ? 3 : 0], ["beam", e.phase >= 3 && e.cd <= 0 ? 3 : 0],
  ]);
  e.stateT = 0;
  if (pick === "claw") {
    e.state = "attack"; e.aim = angleTo(e.pos, p.pos);
    w.hazard({ shape: "cone", pos: { ...e.pos }, angle: e.aim, arc: 2.1, radius: 270, delay: 0.7 * tempo, dmg: e.dmg * 1.3, color: "#ccff00", source: e, knock: 280 });
  } else if (pick === "spiral") {
    e.state = "spiral"; e.cd3 = 0; e.aim = angleTo(e.pos, p.pos);
  } else if (pick === "stomp") {
    e.state = "attack";
    for (let i = 0; i < 3; i++) {
      const offset = i === 0 ? { x: 0, y: 0 } : fromAngle(w.rng.range(0, TAU), w.rng.range(80, 170));
      w.hazard({ shape: "circle", pos: { x: p.pos.x + offset.x, y: p.pos.y + offset.y }, radius: 95, delay: (0.8 + i * 0.3) * tempo, dmg: e.dmg * 1.1, color: "#ccff00", source: e });
    }
  } else if (pick === "summon") {
    e.state = "attack"; e.minionCd = 12; w.sound("summon");
    for (let i = 0; i < 2; i++) w.spawn("crawler", w.pointNearPlayer(e.roomId, 180, 320), e.roomId, { minion: true });
    w.spawn("cursed", w.pointNearPlayer(e.roomId, 120, 240), e.roomId, { minion: true });
  } else if (pick === "charge") {
    e.aim = angleTo(e.pos, p.pos); e.state = "chargeWait";
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: e.aim, length: 620, width: e.radius * 2 + 10, delay: 0.8 * tempo, dmg: 0, color: "#ccff00" });
    setStateAfter(e, "charge", 0.8 * tempo);
  } else if (pick === "pools") {
    e.state = "attack";
    for (let i = 0; i < 5; i++) {
      const at = i === 0 ? { ...p.pos } : w.pointNearPlayer(e.roomId, 60, 260);
      w.hazard({ shape: "circle", pos: at, radius: 70, delay: 1.0, dmg: e.dmg * 0.35, linger: 3.2, tick: 0.5, color: "#ff3d7f", curse: true });
    }
  } else if (pick === "beam") {
    e.state = "attack"; e.cd = 9; e.stateT = -2.2;
    const start = angleTo(e.pos, p.pos) - 1.3;
    w.hazard({ shape: "line", pos: { ...e.pos }, angle: start, length: 900, width: 34, delay: 1.0, dmg: e.dmg * 0.5, linger: 2.6, tick: 0.25, color: "#ccff00", sweep: 2.6 / 2.6, source: e });
    w.sound("charge");
  }
}

function unminted(e: Enemy, w: World, dt: number) {
  const p = w.player;
  if (e.invulnT > 0) e.invulnT -= dt;
  if (bossPhase(e, w, [0.5])) return;
  const tempo = e.phase >= 2 ? 0.75 : 1;
  switch (e.state) {
    case "roar": if (e.stateT > 1.0) { e.state = "idle"; e.stateT = 0; } return;
    case "blink":
      if (e.stateT > 0.5 * tempo) {
        w.burst(e.pos.x, e.pos.y, "#ff3d7f", 24, 200);
        e.pos = w.pointNearPlayer(e.roomId, 180, 280);
        w.burst(e.pos.x, e.pos.y, "#ff3d7f", 24, 200); w.sound("blink");
        e.state = "idle"; e.stateT = 0.5;
      }
      return;
    case "attack": if (e.stateT > 0.9 * tempo) { e.state = "idle"; e.stateT = 0; } return;
  }
  const away = dist(e.pos, p.pos) < 160 ? { x: e.pos.x * 2 - p.pos.x, y: e.pos.y * 2 - p.pos.y } : p.pos;
  steer(e, w, away, e.speed * 0.6, dt);
  if (e.stateT < 0.8 * tempo) return;
  e.stateT = 0;
  const pick = w.rng.weighted<string>([["ring", 3], ["triple", 3], ["blink", 2], ["pools", e.phase >= 2 ? 2.5 : 1]]);
  if (pick === "ring") {
    e.state = "attack";
    const count = e.phase >= 2 ? 22 : 16, offset = w.rng.range(0, TAU);
    for (let i = 0; i < count; i++) w.fire({ pos: { ...e.pos }, vel: fromAngle(offset + (i / count) * TAU, 200), radius: 9, dmg: e.dmg * 0.6, owner: "enemy", life: 4, color: "#ff3d7f", kind: "orb", curse: true, source: e });
    w.sound("enemyShot");
  } else if (pick === "triple") {
    e.state = "attack";
    const base = angleTo(e.pos, p.pos);
    for (let i = -2; i <= 2; i++) w.fire({ pos: { ...e.pos }, vel: fromAngle(base + i * 0.16, 330), radius: 8, dmg: e.dmg * 0.7, owner: "enemy", life: 3, color: "#ff8fb3", kind: "shard", source: e });
    w.sound("enemyShot");
  } else if (pick === "blink") {
    e.state = "blink";
  } else {
    e.state = "attack";
    for (let i = 0; i < 4; i++) w.hazard({ shape: "circle", pos: i === 0 ? { ...p.pos } : w.pointNearPlayer(e.roomId, 60, 240), radius: 65, delay: 0.9, dmg: e.dmg * 0.35, linger: 2.5, tick: 0.5, color: "#ff3d7f", curse: true });
  }
}
