import type { SpriteFacing } from "@rarefriends/friendsdk/sprites";
import type { RfCategory } from "../economy/TokenEconomy";
import type { GateTier, ShrineTier } from "../economy/terms";
import type { EventKind } from "./content";
import type { Item, Rarity } from "./items";
import type { Vec } from "./math";

export type Player = {
  pos: Vec; vel: Vec; radius: number;
  hp: number; energy: number; level: number; xp: number; potions: number;
  aim: number; facing: SpriteFacing; side: "left" | "right"; moving: boolean; walkTime: number;
  attackCd: number; boltCd: number; novaCd: number; dodgeCd: number; dodgeCharges: number; critT: number; potionCd: number;
  dashTime: number; dashDir: Vec; iframes: number;
  combo: number; comboTimer: number; swing: { t: number; dur: number; angle: number; arc: number; range: number; heavy: boolean } | null;
  strikes: number; hitFlash: number; chill: number; weakened: number; orbit: number;
  dead: boolean; deathTime: number;
};

export type EnemyKind = "cursed" | "crawler" | "goblin" | "corrupted" | "warden" | "beast" | "unminted"
  | "wisp" | "gunner" | "drone" | "turret" | "mite" | "spitter" | "eyestalk" | "bloodling" | "shade";
export type Modifier = "vampiric" | "explosive" | "frozen" | "swarm" | "frenzied" | "armored" | "teleporting" | "cursed";

export type Enemy = {
  id: number; kind: EnemyKind; name: string; pos: Vec; vel: Vec; radius: number;
  hp: number; maxHp: number; dmg: number; speed: number; xp: number;
  elite: boolean; champion: boolean; boss: boolean; minion: boolean; mods: Modifier[];
  roomId: number; spawnT: number; dead: boolean;
  state: string; stateT: number; cd: number; cd2: number; cd3: number; aim: number;
  hitFlash: number; knock: Vec; burnT: number; burnDps: number; burnTick: number;
  seed: number; phase: number; anim: number;
  /** Loot Goblin bookkeeping. */
  coins: number; fleeT: number; counter: number; orbitHitT: number;
  /** Extra rewards this enemy carries (shrine hunts, stranger ambushes). */
  bounty?: "voidHunt";
  target?: Vec; minionCd: number; teleportCd: number; stunT: number; invulnT: number;
  dropsMinRarity?: Rarity;
};

export type Projectile = {
  id: number; pos: Vec; vel: Vec; radius: number; dmg: number; owner: "player" | "enemy";
  life: number; color: string; kind: "bolt" | "orb" | "wave" | "shard" | "rune" | "pellet" | "needle" | "glob"; crit?: boolean;
  hit: Set<number>; pierce: number; source?: Enemy; slow?: boolean; curse?: boolean;
  /** Lobbed globs burst into a ring of bullets where they land. */
  burst?: { count: number; speed: number; color: string; dmg: number };
};

export type HazardShape = "circle" | "cone" | "line" | "ring";
export type Hazard = {
  id: number; shape: HazardShape; pos: Vec; radius: number; angle: number; arc: number; length: number; width: number;
  /** Seconds until it fires, and the original telegraph length for drawing progress. */
  delay: number; telegraph: number;
  /** Seconds it keeps hurting after firing (0 = a single hit). */
  linger: number; tick: number; tickT: number;
  dmg: number; owner: "enemy" | "player"; color: string; fired: boolean; hitPlayer: boolean;
  slow?: boolean; curse?: boolean; source?: Enemy; sweep?: number; knock?: number;
};

export type PickupKind = "rf" | "potion" | "item";
export type Pickup = {
  id: number; kind: PickupKind; pos: Vec; vel: Vec; item?: Item; amount?: number;
  reason?: string; category?: RfCategory; t: number; magnet: boolean; delay: number;
};

export type ChestKind = "reward" | "treasure" | "bonus" | "elite" | "boss" | "mythic" | "cursed";
export type InteractableKind = "shrine" | "gate" | "merchant" | "event" | "chest" | "stairs" | "waystone" | "secretWall" | "station" | "prop";
export type Interactable = {
  id: number; kind: InteractableKind; pos: Vec; radius: number; roomId: number; used: boolean;
  shrine?: ShrineTier; gate?: { tier: GateTier; connection: number }; event?: EventKind;
  chest?: { kind: ChestKind; minRarity: Rarity; boost: number; options?: Item[]; rerolls: number; rfPaid: boolean };
  stock?: Record<string, number>; label: string; t: number;
  /** Camp only: what using this spot opens, or a decorative prop. */
  station?: "descend" | "friend" | "stash" | "codex" | "hall" | "rf"; prop?: "statue" | "tent" | "fire" | "lantern" | "pillar" | "crates" | "bedroll";
};

export type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number;
  color: string; kind: "glow" | "spark" | "smoke" | "pixel" | "ring" | "text"; drag: number; gravity: number; grow?: number;
};

export type Floater = { x: number; y: number; vy: number; text: string; color: string; life: number; max: number; size: number };
