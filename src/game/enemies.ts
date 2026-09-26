import type { Enemy, EnemyKind, Hazard, Modifier, Player, Projectile } from "./entities";
import type { Rect } from "./dungeon";
import { angleTo, dist, fromAngle, inCone, normalize, TAU, type Vec } from "./math";
import type { Rng } from "./rng";
import { updateBestiary } from "./bestiary";
import { updateBoss } from "./bosses";
import { updateDepths } from "./depths";

/** What enemy AI may ask of the world. The Game implements it. */
export interface World {
  readonly player: Player;
  readonly time: number;
  readonly depth: number;
  readonly rng: Rng;
  readonly enemies: readonly Enemy[];
  /** Bullet colour for this floor's enemies. */
  readonly bulletColor: string;
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
  /** The Friend's bolt style and signature, which the Reflection copies. */
  readonly mirrorKit: { bolt: string; signature: string };
}

export type SpawnOptions = { elite?: boolean; champion?: boolean; mods?: Modifier[]; variant?: number; minion?: boolean; guardian?: boolean };

/** Each floor enemy has a guardian form: a titled mini-boss twice its size. Mites never guard. */
export const GUARDIAN_TITLES: Readonly<Partial<Record<EnemyKind, string>>> = {
  cursed: "THE FIRST HUSK", crawler: "VOID MATRIARCH", wisp: "THE CHOIRMASTER", gunner: "OSSUARY CAPTAIN", drone: "STATIC OVERSEER",
  turret: "RELAY BASTION", spitter: "THE GREAT MAW", eyestalk: "ALL-SEEING STALK", bloodling: "THE CLOT", shade: "NULL SOVEREIGN",
  bomber: "THE DEMOLISHER", lancer: "BONE CHAMPION", hexer: "HIGH HEXER", sniper: "DEADEYE RELAY", brute: "THE BUTCHER",
  hive: "HIVE QUEEN", wraith: "THE PALE WIDOW", prism: "THE SHATTERED PRISM",
  frostmoth: "THE WINTER MOTH", rimeknight: "KNIGHT OF THE LONG FROST", cinderimp: "THE EMBER KING", slaggolem: "THE SLAG COLOSSUS",
  sporeling: "THE ROT MOTHER", thorn: "THE BRIAR", belldiver: "THE DEEP BELL", eel: "THE CHOIR SERPENT", cog: "THE GREAT GEAR",
  pendulum: "THE LAST SWING", shardling: "THE BROKEN PANE", mirror: "THE SILVER WARDEN", seraph: "THE NULL HERALD",
};

export const MODIFIER_INFO: Readonly<Record<Modifier, { label: string; color: string }>> = {
  vampiric: { label: "Vampiric", color: "#ff2e4d" },
  explosive: { label: "Explosive", color: "#ff9a3c" },
  frozen: { label: "Frozen", color: "#8fe3ff" },
  swarm: { label: "Swarm", color: "#b9ff6b" },
  frenzied: { label: "Frenzied", color: "#ffd23c" },
  armored: { label: "Armored", color: "#9aa3b8" },
  teleporting: { label: "Teleporting", color: "#bb66ff" },
  cursed: { label: "Cursed", color: "#7a2cff" },
  shielded: { label: "Shielded", color: "#4fb0ff" },
  splitting: { label: "Splitting", color: "#ff8fb3" },
  storming: { label: "Storming", color: "#ccff00" },
};
export const ALL_MODIFIERS = Object.keys(MODIFIER_INFO) as Modifier[];

const BASE: Readonly<Record<EnemyKind, { name: string; hp: number; dmg: number; speed: number; radius: number; xp: number }>> = {
  cursed: { name: "CURSED FRIEND", hp: 40, dmg: 12, speed: 155, radius: 13, xp: 7 },
  crawler: { name: "VOID CRAWLER", hp: 28, dmg: 10, speed: 115, radius: 13, xp: 8 },
  goblin: { name: "LOOT GOBLIN", hp: 70, dmg: 0, speed: 190, radius: 13, xp: 25 },
  corrupted: { name: "CORRUPTED FRIEND", hp: 210, dmg: 20, speed: 130, radius: 20, xp: 45 },
  warden: { name: "DUNGEON WARDEN", hp: 1600, dmg: 22, speed: 100, radius: 40, xp: 260 },
  beast: { name: "THE RARE BEAST", hp: 11000, dmg: 28, speed: 115, radius: 56, xp: 700 },
  unminted: { name: "THE UNMINTED", hp: 1200, dmg: 28, speed: 125, radius: 34, xp: 420 },
  wisp: { name: "CHOIR WISP", hp: 22, dmg: 7, speed: 90, radius: 12, xp: 7 },
  gunner: { name: "BONE GUNNER", hp: 36, dmg: 6, speed: 105, radius: 13, xp: 8 },
  drone: { name: "STATIC DRONE", hp: 26, dmg: 6, speed: 175, radius: 12, xp: 8 },
  turret: { name: "RELAY TURRET", hp: 75, dmg: 6, speed: 0, radius: 16, xp: 10 },
  mite: { name: "SIGNAL MITE", hp: 12, dmg: 5, speed: 215, radius: 8, xp: 2 },
  spitter: { name: "MAW SPITTER", hp: 50, dmg: 8, speed: 80, radius: 15, xp: 10 },
  eyestalk: { name: "EYE STALK", hp: 58, dmg: 7, speed: 0, radius: 14, xp: 10 },
  bloodling: { name: "BLOODLING", hp: 40, dmg: 9, speed: 140, radius: 13, xp: 7 },
  shade: { name: "NULL SHADE", hp: 62, dmg: 9, speed: 120, radius: 14, xp: 14 },
  bomber: { name: "GRAVE BOMBER", hp: 24, dmg: 22, speed: 170, radius: 12, xp: 6 },
  lancer: { name: "BONE LANCER", hp: 46, dmg: 16, speed: 115, radius: 13, xp: 10 },
  hexer: { name: "HEX PRIEST", hp: 42, dmg: 12, speed: 95, radius: 13, xp: 12 },
  sniper: { name: "RELAY SNIPER", hp: 30, dmg: 19, speed: 100, radius: 12, xp: 10 },
  brute: { name: "FLESH BRUTE", hp: 150, dmg: 24, speed: 82, radius: 22, xp: 20 },
  hive: { name: "HIVE MOTHER", hp: 115, dmg: 7, speed: 0, radius: 18, xp: 16 },
  wraith: { name: "GRAVE WRAITH", hp: 46, dmg: 15, speed: 140, radius: 13, xp: 11 },
  prism: { name: "VOID PRISM", hp: 95, dmg: 11, speed: 60, radius: 15, xp: 16 },
  frostmoth: { name: "FROST MOTH", hp: 30, dmg: 8, speed: 150, radius: 11, xp: 9 },
  rimeknight: { name: "RIME KNIGHT", hp: 95, dmg: 17, speed: 95, radius: 16, xp: 16 },
  cinderimp: { name: "CINDER IMP", hp: 26, dmg: 10, speed: 185, radius: 10, xp: 8 },
  slaggolem: { name: "SLAG GOLEM", hp: 190, dmg: 24, speed: 62, radius: 22, xp: 24 },
  sporeling: { name: "SPORELING", hp: 34, dmg: 7, speed: 75, radius: 12, xp: 9 },
  thorn: { name: "THORN CRAWLER", hp: 62, dmg: 14, speed: 150, radius: 13, xp: 12 },
  belldiver: { name: "BELL DIVER", hp: 58, dmg: 11, speed: 120, radius: 14, xp: 13 },
  eel: { name: "CHOIR EEL", hp: 42, dmg: 8, speed: 130, radius: 12, xp: 11 },
  cog: { name: "COG SENTRY", hp: 88, dmg: 7, speed: 0, radius: 16, xp: 13 },
  pendulum: { name: "PENDULUM KNIGHT", hp: 110, dmg: 19, speed: 100, radius: 17, xp: 17 },
  shardling: { name: "GLASS SHARDLING", hp: 20, dmg: 9, speed: 170, radius: 10, xp: 6 },
  mirror: { name: "MIRROR SENTINEL", hp: 95, dmg: 10, speed: 45, radius: 16, xp: 16 },
  seraph: { name: "NULL SERAPH", hp: 120, dmg: 12, speed: 90, radius: 16, xp: 20 },
  archivist: { name: "THE ARCHIVIST", hp: 19000, dmg: 30, speed: 90, radius: 44, xp: 900 },
  forgemaster: { name: "THE FORGEMASTER", hp: 25000, dmg: 32, speed: 95, radius: 46, xp: 1000 },
  bloom: { name: "THE MOTHER BLOOM", hp: 70000, dmg: 30, speed: 0, radius: 54, xp: 1100 },
  cantor: { name: "THE DROWNED CANTOR", hp: 75000, dmg: 32, speed: 105, radius: 42, xp: 1200 },
  hourengine: { name: "THE HOUR ENGINE", hp: 55000, dmg: 34, speed: 0, radius: 52, xp: 1300 },
  reflection: { name: "THE REFLECTION", hp: 90000, dmg: 34, speed: 150, radius: 30, xp: 1400 },
  firstfriend: { name: "THE FIRST FRIEND", hp: 140000, dmg: 36, speed: 110, radius: 48, xp: 2500 },
  target: { name: "RUNE", hp: 1, dmg: 0, speed: 0, radius: 15, xp: 0 },
};

const hpCurve = (depth: number) => 1 + 0.45 * (depth - 1) + 0.07 * (depth - 1) ** 2;
const dmgCurve = (depth: number) => 1.2 * (1 + 0.36 * (depth - 1));
/**
 * Enemy health and damage by depth. The first three acts climb steeply; below depth 9 the curves ease to a steady
 * climb that keeps pace with the Friend's levels and gear, so depth 30 is brutal but beatable.
 */
export const hpScale = (depth: number) => depth <= 9 ? hpCurve(depth) : hpCurve(9) * (1 + 0.1 * (depth - 9));
/** Enemies hit hard from the first floor and keep pace with the Friend's gear as you descend. */
export const dmgScale = (depth: number) => depth <= 9 ? dmgCurve(depth) : dmgCurve(9) * (1 + 0.055 * (depth - 9));

/** Every boss, and the depth each one is balanced for (deeper visits in the endless void scale up). */
export const BOSS_KINDS: Readonly<Partial<Record<EnemyKind, number>>> = {
  warden: 3, beast: 9, unminted: 0, archivist: 12, forgemaster: 15, bloom: 18, cantor: 21, hourengine: 24, reflection: 27, firstfriend: 30,
};
const DEPTH_ENEMIES: ReadonlySet<EnemyKind> = new Set(["frostmoth", "rimeknight", "cinderimp", "slaggolem", "sporeling", "thorn", "belldiver", "eel", "cog", "pendulum", "shardling", "mirror", "seraph"]);

let nextEnemyId = 1;
export function createEnemy(kind: EnemyKind, pos: Vec, depth: number, roomId: number, rng: Rng, options: SpawnOptions = {}): Enemy {
  const base = BASE[kind];
  const boss = kind in BOSS_KINDS && !options.minion;
  let hp = base.hp, dmg = base.dmg * dmgScale(depth), speed = base.speed, name = base.name, radius = base.radius;
  const home = BOSS_KINDS[kind] ?? 0;
  if (kind === "warden") {
    hp = depth >= 6 ? 4200 : 1600;
    if (depth >= 6) name = "WARDEN OF THE DEEP";
    if (depth > 9) hp *= hpScale(depth) / hpScale(9);
  } else if (kind === "beast") {
    if (depth > 9) hp *= hpScale(depth) / hpScale(9);
  } else if (kind === "unminted") {
    hp = 1200 + 600 * depth;
  } else if (home > 9) {
    // The lower acts' bosses are tuned for their own depth; in the endless void they grow with it.
    if (depth > home) hp *= hpScale(depth) / hpScale(home);
    // The Reflection's false images break in a few hits.
    if (options.minion) { hp *= 0.025; name = "FALSE REFLECTION"; radius = Math.round(radius * 0.8); }
  } else if (kind !== "target") hp *= hpScale(depth);
  const mods = [...(options.mods ?? [])];
  const guardian = Boolean(options.guardian);
  if (guardian) {
    hp *= 9; dmg *= 1.25; radius = Math.round(radius * 1.9); speed *= 0.85;
    name = GUARDIAN_TITLES[kind] ?? `GREAT ${name}`;
  }
  if (options.champion) { hp *= 1.5; radius += 2; }
  if (options.minion) { hp *= 0.6; dmg *= 0.8; }
  if (mods.includes("armored")) hp *= 1.6;
  if (mods.includes("splitting")) hp *= 0.85;
  if (mods.includes("frenzied")) speed *= 1.35;
  if (mods.length && !boss && !guardian) name = `${mods.map(mod => MODIFIER_INFO[mod].label).join(" ")} ${name}`;
  hp = Math.round(hp);
  return {
    id: nextEnemyId++, kind, name, pos: { ...pos }, vel: { x: 0, y: 0 }, radius, hp, maxHp: hp, dmg, speed,
    xp: Math.round(base.xp * (1 + 0.1 * (depth - 1)) * (options.elite ? 1 : options.champion ? 1.6 : guardian ? 8 : 1)),
    elite: options.elite ?? kind === "corrupted", champion: options.champion ?? false, boss, minion: options.minion ?? false, mods, guardian,
    roomId, spawnT: boss ? 1.4 : guardian ? 1.1 : kind === "target" ? 0.15 : 0.45, dead: false, state: boss ? "intro" : "idle", stateT: 0,
    cd: rng.range(0.4, 1.4), cd2: rng.range(3, 5), cd3: rng.range(5, 8), aim: 0,
    hitFlash: 0, knock: { x: 0, y: 0 }, burnT: 0, burnDps: 0, burnTick: 0, seed: rng.int(0, 1e6), phase: 1, anim: 0,
    coins: 0, fleeT: 0, counter: 0, orbitHitT: 0, minionCd: 6, teleportCd: rng.range(3, 5), stunT: 0, invulnT: 0,
    shield: mods.includes("shielded") ? 2 : 0, shieldCd: 0, stormCd: rng.range(2, 4),
  };
}

/** Pick a modifier set, avoiding duplicates. */
export function rollModifiers(rng: Rng, count: number): Modifier[] {
  return rng.shuffle([...ALL_MODIFIERS]).slice(0, count);
}

export const playerReach = (e: Enemy, p: Player) => e.radius + p.radius + 16;

export function steer(e: Enemy, w: World, target: Vec, speed: number, dt: number) {
  let dir = normalize(target.x - e.pos.x, target.y - e.pos.y);
  if (!w.los(e.pos, target)) dir = w.flow(e.pos) ?? dir;
  e.vel.x = dir.x * speed;
  e.vel.y = dir.y * speed;
  w.moveCircle(e.pos, e.radius, e.vel.x * dt, e.vel.y * dt);
}

export function attackTempo(e: Enemy) { return e.mods.includes("frenzied") ? 0.7 : 1; }

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
  if (e.mods.includes("shielded") && e.shield <= 0) {
    e.shieldCd -= dt;
    if (e.shieldCd <= 0) { e.shield = 2; w.burst(e.pos.x, e.pos.y - e.radius, "#4fb0ff", 10, 120); }
  }
  if (e.mods.includes("storming")) {
    e.stormCd -= dt;
    if (e.stormCd <= 0) {
      e.stormCd = 4.2 * attackTempo(e);
      const n = e.elite ? 12 : 8, off = w.rng.range(0, TAU);
      for (let i = 0; i < n; i++) w.fire({ pos: { ...e.pos }, vel: fromAngle(off + (i / n) * TAU, 150), radius: 7, dmg: e.dmg * 0.6, owner: "enemy", life: 4, color: "#ccff00", kind: "orb", source: e });
    }
  }
  if (e.guardian) guardianRage(e, w, dt);
  if (e.kind === "target") return;
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
    default:
      if (DEPTH_ENEMIES.has(e.kind)) return updateDepths(e, w, dt);
      if (e.kind in BOSS_KINDS) return updateBoss(e, w, dt);
      return updateBestiary(e, w, dt);
  }
  void p;
}

/**
 * Guardians fight like a giant version of their kind, and on top of that throw a telegraphed
 * rage ring every few seconds and call two of their kin when they fall below half health.
 */
function guardianRage(e: Enemy, w: World, dt: number) {
  e.stormCd -= dt;
  if (e.stormCd <= 0) {
    e.stormCd = e.hp < e.maxHp * 0.5 ? 4.5 : 6.5;
    const n = 14 + Math.min(8, w.depth), off = w.rng.range(0, TAU);
    w.hazard({ shape: "ring", pos: { ...e.pos }, radius: e.radius + 30, delay: 0.5, dmg: 0, color: w.bulletColor });
    for (let i = 0; i < n; i++) {
      w.fire({ pos: { ...e.pos }, vel: fromAngle(off + (i / n) * TAU, 150), radius: 8, dmg: e.dmg * 0.55, owner: "enemy", life: 4.5, color: w.bulletColor, kind: "orb", source: e });
    }
    w.sound("roar");
  }
  if (e.hp < e.maxHp * 0.5 && e.minionCd > -100) {
    e.minionCd = -1000;
    w.toast(`${e.name} calls for its kin!`, "#ff4d6d");
    for (let i = 0; i < 2; i++) w.spawn(e.kind === "hive" || e.kind === "turret" || e.kind === "eyestalk" ? "cursed" : e.kind, w.pointNearPlayer(e.roomId, 140, 260), e.roomId, { minion: true });
  }
}

export function melee(e: Enemy, w: World, dt: number, windup: number, arcDeg: number, range: number) {
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

export function bossPhase(e: Enemy, w: World, thresholds: number[]) {
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
      };
      if (e.counter === 0 && e.stateT > 0.25) { volley(0); e.counter = 1; }
      else if (e.counter === 1 && e.stateT > 0.7) { volley(Math.PI / count); e.counter = 2; }
      else if (e.counter === 2 && e.stateT > 1.1) { e.state = "idle"; e.stateT = 0; e.cd3 = 5.5 * fast; }
      return;
    }
    case "chains": {
      // Three chains of bullets whirl out of the Warden's core.
      e.cd3 -= dt;
      if (e.cd3 <= 0) {
        e.cd3 = e.phase >= 2 ? 0.09 : 0.12;
        e.aim += deep ? -0.31 : 0.27;
        for (let arm = 0; arm < 3; arm++) w.fire({ pos: { x: e.pos.x, y: e.pos.y - 40 }, vel: fromAngle(e.aim + (arm / 3) * TAU, 175), radius: 8, dmg: e.dmg * 0.55, owner: "enemy",
          life: 4, color: deep ? "#8fe3ff" : "#ffb347", kind: "orb", slow: deep, source: e });
      }
      if (e.stateT > 1.8) { e.state = "idle"; e.stateT = 0; e.cd3 = 1; }
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
    ["chains", e.cd3 <= 0 ? 2.5 : 0], ["quake", d > 160 ? 2.5 : 0.5],
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
  } else if (pick === "chains") {
    e.state = "chains"; e.aim = angleTo(e.pos, p.pos); w.sound("charge");
  } else if (pick === "quake") {
    // A fissure marches from the Warden toward the Friend, one slam at a time.
    e.state = "attack";
    const a = angleTo(e.pos, p.pos), steps = e.phase >= 2 ? 7 : 5;
    for (let i = 1; i <= steps; i++) {
      w.hazard({ shape: "circle", pos: { x: e.pos.x + Math.cos(a) * i * 78, y: e.pos.y + Math.sin(a) * i * 78 }, radius: 58, delay: (0.55 + i * 0.13) * fast,
        dmg: e.dmg, color: deep ? "#8fe3ff" : "#ff5a3c", source: e, slow: deep });
    }
  }
}

/** A tiny scheduler for "telegraph, then act" transitions without extra state names. */
export function setStateAfter(e: Enemy, next: string, delay: number) {
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
    case "eyes": {
      // Every eye fires a needle at the Friend, one after another.
      const eyes = e.phase >= 2 ? 5 : 3;
      if (e.counter < eyes * 2 && e.stateT > 0.35 + e.counter * 0.11) {
        const ex = e.pos.x + ((e.counter % eyes) - (eyes - 1) / 2) * 22, ey = e.pos.y - 90;
        w.fire({ pos: { x: ex, y: ey }, vel: fromAngle(angleTo({ x: ex, y: ey }, p.pos), 380), radius: 6, dmg: e.dmg * 0.5, owner: "enemy", life: 3, color: "#ccff00", kind: "needle", source: e });
        e.counter++;
      }
      if (e.stateT > 0.5 + eyes * 0.24) { e.state = "idle"; e.stateT = 0; }
      return;
    }
  }
  steer(e, w, p.pos, e.speed * (e.phase === 3 ? 1.2 : 1), dt);
  if (e.stateT < 0.8 * tempo) return;
  const d = dist(e.pos, p.pos);
  const pick = w.rng.weighted<string>([
    ["claw", d < 280 ? 4 : 0.5], ["spiral", 2.5], ["stomp", 3],
    ["summon", e.phase >= 2 && e.minionCd <= 0 ? 2 : 0], ["charge", e.phase >= 2 && d > 220 ? 3 : 0],
    ["pools", e.phase >= 3 ? 3 : 0], ["beam", e.phase >= 3 && e.cd <= 0 ? 3 : 0],
    ["eyes", 2.5], ["curtain", e.phase >= 2 ? 2.5 : 1],
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
  } else if (pick === "eyes") {
    e.state = "eyes"; e.counter = 0;
  } else if (pick === "curtain") {
    // A wall of bullets sweeps across the arena with one gap to dodge through.
    e.state = "attack";
    const r = w.roomRect(e.roomId), fromLeft = p.pos.x > r.x + r.w / 2, n = 18;
    const gap = Math.floor(w.rng.range(3, n - 4));
    for (let i = 0; i < n; i++) {
      if (i >= gap && i < gap + 3) continue;
      const y = r.y + 30 + (i / (n - 1)) * (r.h - 60);
      w.fire({ pos: { x: fromLeft ? r.x + 20 : r.x + r.w - 20, y }, vel: { x: fromLeft ? 210 : -210, y: 0 }, radius: 9, dmg: e.dmg * 0.6, owner: "enemy",
        life: r.w / 210, color: "#ff3d7f", kind: "orb", source: e });
    }
    w.sound("roar");
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
  const pick = w.rng.weighted<string>([["ring", 3], ["triple", 3], ["blink", 2], ["pools", e.phase >= 2 ? 2.5 : 1], ["starfall", e.phase >= 2 ? 2.5 : 1]]);
  if (pick === "ring") {
    e.state = "attack";
    const count = e.phase >= 2 ? 22 : 16, offset = w.rng.range(0, TAU);
    for (let i = 0; i < count; i++) w.fire({ pos: { ...e.pos }, vel: fromAngle(offset + (i / count) * TAU, 200), radius: 9, dmg: e.dmg * 0.6, owner: "enemy", life: 4, color: "#ff3d7f", kind: "orb", curse: true, source: e });
  } else if (pick === "triple") {
    e.state = "attack";
    const base = angleTo(e.pos, p.pos);
    for (let i = -2; i <= 2; i++) w.fire({ pos: { ...e.pos }, vel: fromAngle(base + i * 0.16, 330), radius: 8, dmg: e.dmg * 0.7, owner: "enemy", life: 3, color: "#ff8fb3", kind: "shard", source: e });
  } else if (pick === "blink") {
    e.state = "blink";
  } else if (pick === "starfall") {
    // Void stars rain down in a widening spiral around the Friend.
    e.state = "attack";
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, d = 40 + i * 26;
      w.hazard({ shape: "circle", pos: { x: p.pos.x + Math.cos(a) * d, y: p.pos.y + Math.sin(a) * d }, radius: 44, delay: 0.6 + i * 0.09, dmg: e.dmg * 0.8, color: "#ff3d7f", source: e });
    }
  } else {
    e.state = "attack";
    for (let i = 0; i < 4; i++) w.hazard({ shape: "circle", pos: i === 0 ? { ...p.pos } : w.pointNearPlayer(e.roomId, 60, 240), radius: 65, delay: 0.9, dmg: e.dmg * 0.35, linger: 2.5, tick: 0.5, color: "#ff3d7f", curse: true });
  }
}
