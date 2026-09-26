import { AudioEngine, type MusicMode, type RoomSong, type SfxName } from "../audio/audio";
import { InsufficientRfError, rf, wholeRf, type RfCategory, type RfTransaction, type TokenEconomy } from "../economy/TokenEconomy";
import {
  GAMBLER_PAYOUTS, RF_COSTS, RF_GOBLIN_MAX_COINS, RF_NORMAL_ENEMY_CHANCE, RF_REWARDS, RF_STARTING_BALANCE,
  type GateTier, type MerchantOffer, type ReviveKind,
} from "../economy/terms";
import type { FriendArt } from "../render/sprites";
import {
  CURSED_BOX, DEFAULT_COSMETICS, EVENTS, GATES, type CosmeticSlot, type RosterKind, GOLDEN_DOOR_RARITIES, LEGENDARY_GAMBLE, MERCHANT, SHRINES, bandForFloor, cosmetic,
} from "./content";
import { generateArena, generateFloor, roomAt, roomCenter, TILE, T, type Floor, type Rect, type Room } from "./dungeon";
import { createEnemy, rollModifiers, updateEnemy, type SpawnOptions, type World } from "./enemies";
import type {
  ChestKind, Enemy, EnemyKind, Floater, Hazard, Interactable, Particle, Pickup, Player, Projectile,
} from "./entities";
import { Input } from "./input";
import { friendKit, type FriendKit } from "./kit";
import {
  generateItem, itemScore, newItemId, rarityRank, RARITIES, RARITY_STYLE, rollRarity, SLOTS, type Item, type Rarity, type Slot,
} from "./items";
import { angleDiff, angleTo, dist, fromAngle, inCone, normalize, segmentDistance, TAU, type Vec } from "./math";
import { hash32, randomSeed, Rng } from "./rng";
import { BOONS, DEFAULT_TRAIT, FAMILY_TRAITS, computeStats, xpForLevel, type BoonId, type Buff, type Stats } from "./stats";
import { Store } from "./store";
import type { Banner, CampTab, CodexEntry, FollowUp, Modal, RunSummary, Screen, Settings, Toast, UiState } from "./types";
import { generateCamp } from "./camp";
import { scoreRun, type RunScore, type ScoreOutcome } from "./score";

export type FriendIdentity = Readonly<{ id: bigint; label: string; family: string }>;
export type Renderer = { render(dt: number): void; floorChanged(): void };

type Wave = { kind: EnemyKind; options: SpawnOptions }[];
type Encounter = { roomId: number; waves: Wave[]; next: number; reward: "none" | "chest" | "horde" | "arena"; chestKind?: ChestKind; bonus?: GateTier };

type RunState = {
  seed: number; started: number; kills: number; elites: number; bosses: string[]; rarest: Item | null;
  rfStart: number; rfEarned: number; rfSpent: number; firstTx: number; maxDepth: number;
  firstLootGiven: boolean; combatRoomsCleared: number; nextChestMin: Rarity | null; beastDefeated: boolean;
};

const PLAYER_RADIUS = 14;
/** Encounter budget cost of each roster enemy (a mite entry spawns a pack of four). */
const ENEMY_COST: Readonly<Record<RosterKind, number>> = {
  cursed: 1, crawler: 1.3, wisp: 1.2, gunner: 1.4, drone: 1.4, turret: 1.8, mite: 2, spitter: 1.6, eyestalk: 1.6, bloodling: 1.1, shade: 2,
  bomber: 1.1, lancer: 1.4, hexer: 1.8, sniper: 1.6, brute: 2.4, hive: 2.6, wraith: 1.5, prism: 2.4,
};
/** Kinds that never move; each wave holds at most two of them. */
const STATIONARY: ReadonlySet<RosterKind> = new Set(["turret", "eyestalk", "hive"]);
const BAG_LIMIT = 10;
const STASH_LIMIT = 12;
const MAX_PARTICLES = 700;

export class Game implements World {
  readonly store: Store<UiState>;
  readonly input = new Input();
  readonly audio = new AudioEngine();
  renderer: Renderer | null = null;

  // World state, read by the renderer.
  floor: Floor | null = null;
  player: Player = freshPlayer({ x: 0, y: 0 });
  stats: Stats;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  interactables: Interactable[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  /** Enemies that just died, kept briefly so the renderer can dissolve them. */
  corpses: { e: Enemy; t: number }[] = [];
  camera: Vec = { x: 0, y: 0 };
  shakeAmount = 0;
  time = 0;
  depth = 1;
  rng = new Rng(1);
  prompt: { text: string; pos: Vec; color: string } | null = null;
  barriers: Rect[] = [];
  lockedRoom: number | null = null;
  encounter: Encounter | null = null;
  currentRoom: number | null = null;
  boss: Enemy | null = null;
  lastHitBy = "";
  /** Damage taken by source this run, for balance playtests. */
  damageTally = new Map<string, number>();

  // Character build.
  level = 1;
  boons = new Map<BoonId, number>();
  equipment: Record<Slot, Item | null> = { weapon: null, relic: null, charm: null, ring: null, mask: null };
  bag: Item[] = [];
  buffs: Buff[] = [];
  secured = new Set<number>();
  readonly trait: { name: string; text: string; mods: Buff["mods"] };
  /** This Friend's own attack, bolt, dodge and signature ability, derived from its family and art seed. */
  readonly kit: FriendKit;

  // Session (camp) state. The sandbox has no storage, so this lasts until reload.
  stash: Item[] = [];
  heirloomId: number | null = null;
  readonly codex = new Map<string, CodexEntry>();
  readonly hall: RunSummary[] = [];
  runsStarted = 0;
  /** Every run's score this session, added together. */
  lifetimeScore = 0;
  bestScore = 0;
  /** Wardrobe: cosmetics bought with RF at the Dye Altar, and which are worn. Session only. */
  readonly ownedCosmetics = new Set<string>(Object.values(DEFAULT_COSMETICS));
  readonly worn: Record<CosmeticSlot, string> = { ...DEFAULT_COSMETICS };

  private run: RunState | null = null;
  private saved: { floor: Floor; pos: Vec; interactables: Interactable[]; pickups: Pickup[]; room: number | null } | null = null;
  private raf = 0;
  private last = 0;
  private hitStop = 0;
  private externalPause = false;
  private busy = false;
  private flowField: { room: number; tx: number; ty: number; field: Int16Array; rect: Rect } | null = null;
  private nextId = 1;
  private toastId = 1;
  private uiClock = 0;
  private unsubscribeEconomy: () => void;
  private disposed = false;

  constructor(readonly friend: FriendIdentity, readonly art: FriendArt, readonly economy: TokenEconomy, settings: Settings) {
    this.trait = FAMILY_TRAITS[friend.family] ?? DEFAULT_TRAIT;
    this.kit = friendKit(friend.family, art.sprites?.seed ?? Number(friend.id % 4294967296n));
    this.audio.setVoice(friend.family, this.kit.seed);
    this.stats = computeStats(1, this.trait.mods, this.boons, [], []);
    this.store = new Store<UiState>({
      screen: "title", modal: { kind: "none" }, busy: false,
      balance: wholeRf(economy.getBalance()), rfFlash: null, recent: [...economy.getHistory()].slice(-5).reverse(),
      depth: 1, floorName: bandForFloor(1).area.toUpperCase(), toasts: [], banner: null, settings, pendingLevels: 0, touch: false,
      canInteract: false, summary: null, version: 0, campPanel: null,
    });
    this.audio.setMuted(!settings.sound);
    this.audio.setMusic(settings.music);
    this.unsubscribeEconomy = economy.subscribe(tx => this.onTransaction(tx));
    this.input.onAction = action => {
      if (action === "mute") this.toggleSetting("sound");
    };
  }

  get ui() { return this.store.get(); }
  get bulletColor() { return this.floor?.band.bullet ?? "#c9b8ff"; }
  get settings() { return this.ui.settings; }
  get screen(): Screen { return this.ui.screen; }
  get modal(): Modal { return this.ui.modal; }
  get reducedMotion() { return this.settings.reducedMotion; }
  get runActive() { return this.run !== null; }
  get runSeed() { return this.run?.seed ?? 0; }
  get runTimeMs() { return this.run ? performance.now() - this.run.started : 0; }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    this.last = performance.now();
    const frame = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.audio.dispose();
    this.unsubscribeEconomy();
  }

  /** Losing keyboard focus mid-fight (clicking the wallet toolbar, switching tabs) pauses instead of leaving the Friend defenceless. */
  onFocusLost() {
    if (this.screen === "run" && this.modal.kind === "none" && !this.player.dead) this.setModal({ kind: "pause" });
  }

  setExternalPause(paused: boolean) {
    this.externalPause = paused;
    if (paused) this.input.clear();
  }

  private simulating() {
    if (this.externalPause || this.modal.kind !== "none") return false;
    return this.screen === "run" || (this.screen === "camp" && this.ui.campPanel === null && this.floor !== null);
  }

  private tick(dt: number) {
    this.input.gameplay = this.simulating();
    if (this.simulating()) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else {
        // Two sub-steps keep fast dashes and projectiles from tunnelling on slow frames.
        const steps = dt > 1 / 50 ? 2 : 1;
        for (let i = 0; i < steps; i++) this.update(dt / steps);
      }
    } else {
      this.input.flush();
    }
    this.uiClock += dt;
    if (this.uiClock > 0.25) { this.uiClock = 0; this.expireToasts(); }
    this.renderer?.render(dt);
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────

  private patch(patch: Partial<UiState>) { this.store.update({ ...patch, version: this.ui.version + 1 }); }
  setModal(modal: Modal) {
    this.input.clear();
    this.patch({ modal: modal.kind === "reveal" && modal.id === undefined ? { ...modal, id: this.nextId++ } : modal });
  }
  toast(text: string, color = "#e9e4ff") {
    const toast: Toast = { id: this.toastId++, text, color, until: performance.now() + 2600 };
    this.patch({ toasts: [...this.ui.toasts.slice(-3), toast] });
  }
  private banner(title: string, subtitle: string | undefined, color: string, kind: Banner["kind"]) {
    this.patch({ banner: { id: this.toastId++, title, subtitle, color, kind } });
  }
  private expireToasts() {
    const now = performance.now();
    if (this.ui.toasts.some(t => t.until < now)) this.patch({ toasts: this.ui.toasts.filter(t => t.until >= now) });
  }
  private onTransaction(tx: RfTransaction) {
    const delta = wholeRf(tx.amount) * (tx.kind === "spend" ? -1 : 1);
    this.patch({ balance: wholeRf(tx.balanceAfter), rfFlash: { id: tx.id, delta }, recent: [...this.economy.getHistory()].slice(-5).reverse() });
  }
  setTouch(touch: boolean) { if (touch !== this.ui.touch) this.patch({ touch }); }

  toggleSetting(key: keyof Settings) {
    const settings = { ...this.settings, [key]: !this.settings[key] };
    this.patch({ settings });
    if (key === "sound") { this.audio.setMuted(!settings.sound); if (settings.sound) void this.audio.unlock(); }
    if (key === "music") this.audio.setMusic(settings.music);
  }

  sfx(name: SfxName, intensity = 1) { this.audio.play(name, intensity); }
  sound(name: string) { this.audio.play(name as SfxName); }

  // ─── Screens ───────────────────────────────────────────────────────────────

  beginFromTitle() {
    void this.audio.unlock();
    this.audio.cue("action-start");
    this.audio.friendVoice("greet");
    this.enterCamp();
    this.toast("Walk down the great stairs to begin your descent", "#ccff00");
  }

  returnToCamp() {
    this.enterCamp();
  }

  /** The walkable camp: a ruined Rare Friends sanctuary above the Descent. */
  private enterCamp() {
    const camp = generateCamp();
    this.resetFloorEntities();
    this.floor = camp.floor;
    for (const thing of camp.things) this.addInteractable(thing);
    this.player = freshPlayer(camp.spawn);
    this.player.aim = -Math.PI / 2;
    this.player.facing = "up";
    this.player.dodgeCharges = this.kit.dodge.charges;
    this.stats = computeStats(1, this.trait.mods, new Map(), [], []);
    this.player.hp = this.stats.maxHp;
    this.camera = { x: camp.spawn.x - 480, y: camp.spawn.y - 330 };
    this.currentRoom = 0;
    this.barriers = [];
    this.renderer?.floorChanged();
    this.audio.setRoomSong(null);
    this.audio.setMusicMode("camp");
    this.patch({ screen: "camp", modal: { kind: "none" }, summary: null, banner: null, toasts: [], campPanel: null });
  }

  /** The mood for where the Friend stands: the camp or this floor's style. */
  private placeMusic(): MusicMode { return this.screen === "camp" || !this.floor ? "camp" : this.floor.band.style; }

  /** Special rooms have their own tune, which fades in over the floor's while you stand inside. */
  roomSongFor(room: Room | null): RoomSong | null {
    if (!room || this.screen !== "run" || this.boss || this.lockedRoom !== null || this.player.dead || this.floor?.isArena) return null;
    switch (room.type) {
      case "shrine": return room.shrine === "void" ? "voidShrine" : "shrine";
      case "merchant": return "merchant";
      case "treasure": return "treasure";
      case "secret": return "secret";
      case "event":
        switch (room.event) {
          case "corpse": return "corpse";
          case "lostFriend": return "lostFriend";
          case "gambler": return "gambler";
          case "blackDoor": return "voidShrine";
          case "goldenDoor": return "treasure";
          default: return "mystery";
        }
      default: return null;
    }
  }
  private refreshRoomMusic() {
    const floor = this.floor, room = floor && this.currentRoom !== null ? floor.rooms[this.currentRoom] ?? null : null;
    this.audio.setRoomSong(this.roomSongFor(room));
  }

  // ─── Wardrobe ──────────────────────────────────────────────────────────────

  /** Buy a cosmetic with RF (or wear it, if already owned). Spends go through the same economy as everything else. */
  async buyCosmetic(id: string) {
    const item = cosmetic(id);
    if (!item) return;
    if (this.ownedCosmetics.has(id)) { this.wearCosmetic(id); return; }
    if (!(await this.pay(item.cost, `Dye Altar: ${item.name}`, "cosmetic"))) return;
    this.ownedCosmetics.add(id);
    this.worn[item.slot] = id;
    this.audio.cue("reveal-rare");
    this.audio.friendVoice("happy");
    const color = item.color.startsWith("#") ? item.color : this.glowColor();
    this.burst(this.player.pos.x, this.player.pos.y - 20, color, 40, 240);
    this.particle({ x: this.player.pos.x, y: this.player.pos.y - 12, vx: 0, vy: 0, life: 0.5, size: 90, color, kind: "ring", drag: 0, gravity: 0 });
    this.toast(`${item.name} unlocked and worn`, color);
    this.patch({});
  }

  wearCosmetic(id: string) {
    const item = cosmetic(id);
    if (!item || !this.ownedCosmetics.has(id) || this.worn[item.slot] === id) return;
    this.worn[item.slot] = id;
    this.sfx("pickup");
    this.patch({});
  }

  /** The Friend's skin look, from the wardrobe. */
  get skinLook() { return cosmetic(this.worn.skin)?.look ?? "hero"; }

  /** The Friend's glow color right now. Prismatic cycles; Null Halo has a burning rim. */
  glowColor(t = this.time): string {
    const color = cosmetic(this.worn.glow)?.color ?? "#ccff00";
    if (color === "prism") return PRISM[Math.floor(t * 5) % PRISM.length];
    if (color === "null") return "#ff3d7f";
    return color;
  }

  private trailParticle() {
    const p = this.player, x = p.pos.x + (Math.random() - 0.5) * 14, y = p.pos.y + 2;
    switch (this.worn.trail) {
      case "trail-embers":
        this.particle({ x, y: y - 8, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40, life: 0.7, size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? "#ff9a3c" : "#ffd23c", kind: "spark", drag: 1.5, gravity: -20 });
        break;
      case "trail-sparkles":
        this.particle({ x, y: y - 10 - Math.random() * 20, vx: 0, vy: -10, life: 0.6, size: 3, color: this.glowColor(), kind: "spark", drag: 1, gravity: 0 });
        break;
      case "trail-void":
        this.particle({ x, y: y - 4, vx: 0, vy: -6, life: 0.8, size: 5, color: "#12081c", kind: "pixel", drag: 1, gravity: 0 });
        this.particle({ x, y: y - 4, vx: 0, vy: -6, life: 0.5, size: 7, color: "#ff3d7f", kind: "ring", drag: 0, gravity: 0 });
        break;
      case "trail-runes":
        this.particle({ x: p.pos.x, y: p.pos.y + 4, vx: 0, vy: 0, life: 0.7, size: 11, color: "#ccff00", kind: "ring", drag: 0, gravity: 0 });
        break;
    }
  }

  openCampPanel(tab: CampTab) {
    if (tab === "friend") this.audio.friendVoice("greet");
    this.input.clear();
    this.sfx("ui");
    this.patch({ campPanel: tab });
  }
  closeCampPanel() { this.patch({ campPanel: null }); }

  setHeirloom(id: number | null) {
    this.heirloomId = id;
    this.patch({});
  }

  /** Start a new descent from the camp or the summary screen. */
  async descend() {
    if (this.busy) return;
    void this.audio.unlock();
    this.busy = true;
    try {
      const balance = wholeRf(this.economy.getBalance());
      if (balance < RF_STARTING_BALANCE) {
        await this.economy.reward(rf(RF_STARTING_BALANCE - balance), "Descent stipend (simulated preview)", "stipend");
      }
    } finally { this.busy = false; }
    this.startRun();
  }

  private startRun() {
    const seed = randomSeed();
    this.rng = new Rng(seed);
    this.runsStarted++;
    this.run = {
      seed, started: performance.now(), kills: 0, elites: 0, bosses: [], rarest: null,
      rfStart: wholeRf(this.economy.getBalance()), rfEarned: 0, rfSpent: 0, firstTx: this.economy.getHistory().length,
      maxDepth: 1, firstLootGiven: false, combatRoomsCleared: 0, nextChestMin: null, beastDefeated: false,
    };
    this.level = 1;
    this.boons.clear();
    this.equipment = { weapon: null, relic: null, charm: null, ring: null, mask: null };
    this.bag = [];
    this.buffs = [];
    this.secured.clear();
    this.saved = null;
    this.damageTally.clear();
    this.player = freshPlayer({ x: 0, y: 0 });
    const starter = generateItem(this.rng, 1, { slot: "weapon", rarity: "common" });
    this.equipment.weapon = { ...starter, name: "Rune Claw", flavor: "Every Friend starts somewhere." };
    this.discover(this.equipment.weapon);
    const heirloom = this.stash.find(item => item.id === this.heirloomId);
    if (heirloom) {
      this.equipment[heirloom.slot] = heirloom;
      this.secured.add(heirloom.id);
      this.stash = this.stash.filter(item => item.id !== heirloom.id);
      this.heirloomId = null;
    }
    this.refreshStats();
    this.player.hp = this.stats.maxHp;
    this.player.energy = this.stats.energyMax;
    this.player.potions = 2;
    this.player.dodgeCharges = this.kit.dodge.charges;
    this.patch({ screen: "run", modal: { kind: "none" }, summary: null, pendingLevels: 0, toasts: [], campPanel: null });
    this.enterFloor(1);
  }

  private enterFloor(depth: number) {
    this.depth = depth;
    if (this.run) this.run.maxDepth = Math.max(this.run.maxDepth, depth);
    this.floor = generateFloor(depth, hash32((this.run?.seed ?? 1) ^ Math.imul(depth, 0x9e3779b1)));
    this.resetFloorEntities();
    for (const buff of this.buffs) if (buff.floors !== undefined) buff.floors--;
    this.buffs = this.buffs.filter(buff => buff.floors === undefined || buff.floors > 0);
    this.refreshStats();
    this.spawnFloorContent(this.floor);
    this.player.pos = { ...this.floor.start };
    this.camera = { x: this.player.pos.x - 480, y: this.player.pos.y - 320 };
    this.currentRoom = 0;
    this.recomputeBarriers();
    this.renderer?.floorChanged();
    this.audio.setRoomSong(null);
    this.audio.setMusicMode(this.placeMusic());
    this.patch({ depth, floorName: this.floor.band.area.toUpperCase() });
    this.banner(`DEPTH ${depth}`, `${this.floor.band.name} · ${this.floor.band.area}`, this.floor.band.accent, "floor");
    if (depth === 1 && this.runsStarted === 1) this.toast(this.ui.touch ? "Drag the left side to move · tap ATTACK" : "WASD to move · J / click to attack · SPACE to dodge", "#ccff00");
  }

  private resetFloorEntities() {
    this.enemies = []; this.projectiles = []; this.hazards = []; this.pickups = []; this.interactables = [];
    this.particles = []; this.floaters = []; this.corpses = []; this.lockedRoom = null; this.encounter = null; this.boss = null; this.flowField = null;
  }

  // ─── Floor content ─────────────────────────────────────────────────────────

  private spawnFloorContent(floor: Floor) {
    for (const room of floor.rooms) {
      const c = roomCenter(room);
      if (room.type === "shrine" && room.shrine) this.addInteractable({ kind: "shrine", pos: c, radius: 30, roomId: room.id, shrine: room.shrine, label: SHRINES[room.shrine].name });
      if (room.type === "merchant") this.addInteractable({ kind: "merchant", pos: c, radius: 26, roomId: room.id, label: "MOTH, THE PEDDLER",
        stock: Object.fromEntries(Object.entries(MERCHANT).map(([key, offer]) => [key, offer.stock])) });
      if (room.type === "event" && room.event) this.addInteractable({ kind: "event", pos: c, radius: 28, roomId: room.id, event: room.event, label: EVENTS[room.event].name });
      if (room.type === "treasure") this.addInteractable({ kind: "chest", pos: c, radius: 22, roomId: room.id, label: "TREASURE CHEST",
        chest: { kind: "treasure", minRarity: "uncommon", boost: 0.35, rerolls: 0, rfPaid: false } });
      if (room.type === "exit") this.addInteractable({ kind: "stairs", pos: c, radius: 34, roomId: room.id, label: "DESCEND DEEPER" });
    }
    for (const connection of floor.connections) {
      const parent = floor.rooms[connection.a];
      const inward = normalize(roomCenter(parent).x - connection.centerA.x, roomCenter(parent).y - connection.centerA.y);
      if (connection.kind === "gate" && connection.tier) {
        this.addInteractable({ kind: "gate", pos: { x: connection.centerA.x + inward.x * 34, y: connection.centerA.y + inward.y * 34 }, radius: 34,
          roomId: parent.id, gate: { tier: connection.tier, connection: connection.id }, label: GATES[connection.tier].name });
      }
      if (connection.kind === "secret") {
        this.addInteractable({ kind: "secretWall", pos: { ...connection.centerA }, radius: 40, roomId: parent.id, label: "A CRACKED WALL" });
      }
    }
  }

  private addInteractable(partial: Omit<Interactable, "id" | "used" | "t">) {
    const item: Interactable = { id: this.nextId++, used: false, t: 0, ...partial };
    this.interactables.push(item);
    return item;
  }

  recomputeBarriers() {
    const floor = this.floor;
    if (!floor) return;
    const list: Rect[] = [];
    for (const c of floor.connections) if (!c.open) list.push(c.doorA);
    if (this.lockedRoom !== null) {
      const room = floor.rooms[this.lockedRoom];
      for (const id of room.connections) {
        const c = floor.connections[id];
        list.push(c.a === room.id ? c.doorA : c.doorB);
      }
    }
    this.barriers = list;
  }

  // ─── World interface (enemy AI) ─────────────────────────────────────────────

  private solidAt(x: number, y: number): boolean {
    const floor = this.floor;
    if (!floor) return true;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height) return true;
    const tile = floor.tiles[ty * floor.width + tx];
    if (tile === T.Wall || tile === T.Void) return true;
    for (const b of this.barriers) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
    return false;
  }

  circleBlocked(x: number, y: number, r: number): boolean {
    if (this.solidAt(x, y)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      if (this.solidAt(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
    }
    return false;
  }

  moveCircle(pos: Vec, radius: number, dx: number, dy: number) {
    const hit = { hitX: false, hitY: false };
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const nx = pos.x + sx;
      if (!this.circleBlocked(nx, pos.y, radius)) pos.x = nx;
      else if (!sy && sx && this.cornerSlide(pos, radius, "y", nx, Math.abs(sx))) { /* slid around a corner */ }
      else hit.hitX = true;
      const ny = pos.y + sy;
      if (!this.circleBlocked(pos.x, ny, radius)) pos.y = ny;
      else if (!sx && sy && this.cornerSlide(pos, radius, "x", ny, Math.abs(sy))) { /* slid around a corner */ }
      else hit.hitY = true;
    }
    return hit;
  }

  /** Corner correction: a straight move that clips a wall corner nudges sideways (up to 10px) instead of sticking. */
  private cornerSlide(pos: Vec, radius: number, axis: "x" | "y", target: number, step: number): boolean {
    for (let off = 2; off <= 10; off += 2) for (const sign of [-1, 1]) {
      const px = axis === "x" ? pos.x + sign * off : target, py = axis === "y" ? pos.y + sign * off : target;
      const sideX = axis === "x" ? pos.x + sign * off : pos.x, sideY = axis === "y" ? pos.y + sign * off : pos.y;
      if (!this.circleBlocked(px, py, radius) && !this.circleBlocked(sideX, sideY, radius)) {
        if (axis === "x") pos.x += sign * Math.min(off, step); else pos.y += sign * Math.min(off, step);
        return true;
      }
    }
    return false;
  }

  los(a: Vec, b: Vec): boolean {
    const d = dist(a, b), steps = Math.ceil(d / 12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  /** Breadth-first flow field toward the player inside the current room, rebuilt when the player moves tiles. */
  flow(pos: Vec): Vec | null {
    const floor = this.floor, room = this.lockedRoom ?? this.currentRoom;
    if (!floor || room === null) return null;
    const r = floor.rooms[room];
    const rect = { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 };
    const ptx = Math.floor(this.player.pos.x / TILE), pty = Math.floor(this.player.pos.y / TILE);
    if (!this.flowField || this.flowField.room !== room || this.flowField.tx !== ptx || this.flowField.ty !== pty) {
      const field = new Int16Array(rect.w * rect.h).fill(-1);
      const queue: number[] = [];
      const lx = ptx - rect.x, ly = pty - rect.y;
      if (lx >= 0 && ly >= 0 && lx < rect.w && ly < rect.h) { field[ly * rect.w + lx] = 0; queue.push(ly * rect.w + lx); }
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head], x = i % rect.w, y = (i - x) / rect.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= rect.w || ny >= rect.h) continue;
          const j = ny * rect.w + nx;
          if (field[j] !== -1) continue;
          const tile = floor.tiles[(ny + rect.y) * floor.width + nx + rect.x];
          if (tile === T.Wall || tile === T.Void) continue;
          field[j] = field[i] + 1;
          queue.push(j);
        }
      }
      this.flowField = { room, tx: ptx, ty: pty, field, rect };
    }
    const f = this.flowField;
    const tx = Math.floor(pos.x / TILE) - f.rect.x, ty = Math.floor(pos.y / TILE) - f.rect.y;
    let best = Infinity, dir: Vec | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= f.rect.w || ny >= f.rect.h) continue;
      const v = f.field[ny * f.rect.w + nx];
      // Diagonals only when both side tiles are open, so enemies do not clip pillar corners.
      if (dx && dy && (f.field[ty * f.rect.w + nx] < 0 || f.field[ny * f.rect.w + tx] < 0)) continue;
      if (v >= 0 && v < best) { best = v; dir = normalize(dx, dy); }
    }
    return dir;
  }

  roomRect(roomId: number): Rect {
    const room = this.floor!.rooms[roomId];
    return { x: room.x * TILE, y: room.y * TILE, w: room.w * TILE, h: room.h * TILE };
  }

  pointNearPlayer(roomId: number, min: number, max: number): Vec {
    const r = this.roomRect(roomId);
    for (let i = 0; i < 40; i++) {
      const a = this.rng.range(0, TAU), d = this.rng.range(min, max);
      const p = { x: this.player.pos.x + Math.cos(a) * d, y: this.player.pos.y + Math.sin(a) * d };
      if (p.x < r.x + 40 || p.y < r.y + 40 || p.x > r.x + r.w - 40 || p.y > r.y + r.h - 40) continue;
      if (!this.circleBlocked(p.x, p.y, 22)) return p;
    }
    return this.randomFloorPoint(roomId, min);
  }

  randomFloorPoint(roomId: number, awayFromPlayer = 0): Vec {
    const r = this.roomRect(roomId);
    for (let i = 0; i < 60; i++) {
      const p = { x: this.rng.range(r.x + 48, r.x + r.w - 48), y: this.rng.range(r.y + 48, r.y + r.h - 48) };
      if (dist(p, this.player.pos) < awayFromPlayer - i * 3) continue;
      if (!this.circleBlocked(p.x, p.y, 24)) return p;
    }
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  fire(p: Omit<Projectile, "id" | "hit" | "pierce"> & { pierce?: number }) {
    this.projectiles.push({ ...p, id: this.nextId++, hit: new Set(), pierce: p.pierce ?? 0 });
  }

  hazard(h: Partial<Hazard> & Pick<Hazard, "shape" | "pos" | "delay" | "dmg">) {
    this.hazards.push({
      id: this.nextId++, radius: 0, angle: 0, arc: 0, length: 0, width: 0, telegraph: h.delay, linger: 0, tick: 0.5, tickT: 0,
      owner: "enemy", color: "#ff2e4d", fired: false, hitPlayer: false, ...h,
    });
    if (h.owner !== "player" && h.delay > 0.3 && h.dmg > 0) this.sfx("telegraph");
  }

  spawn(kind: EnemyKind, pos: Vec, roomId: number, options: SpawnOptions = {}): Enemy {
    const enemy = createEnemy(kind, pos, this.depth, roomId, this.rng, options);
    this.enemies.push(enemy);
    this.burst(pos.x, pos.y, enemy.elite ? "#ff2e4d" : "#9a7fd1", enemy.boss ? 40 : 10, 120);
    return enemy;
  }

  burst(x: number, y: number, color: string, count: number, speed = 160) {
    const n = Math.ceil(count * (this.reducedMotion ? 0.4 : 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.9);
      this.particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.45, size: 2 + Math.random() * 3, color, kind: Math.random() < 0.5 ? "pixel" : "spark", drag: 3, gravity: 0 });
    }
  }

  particle(p: Omit<Particle, "max">) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.splice(0, 64);
    this.particles.push({ ...p, max: p.life });
  }

  shake(amount: number) {
    if (this.reducedMotion || !this.settings.screenShake) return;
    this.shakeAmount = Math.min(18, this.shakeAmount + amount);
  }

  floater(x: number, y: number, text: string, color: string, size = 16) {
    if (!this.settings.damageNumbers && /^\d+!?$/.test(text)) return;
    this.floaters.push({ x: x + (Math.random() - 0.5) * 10, y, vy: -60, text, color, life: 0.8, max: 0.8, size });
  }

  dropGoblinCoin(enemy: Enemy) {
    this.dropPickup("rf", enemy.pos, { amount: RF_REWARDS.goblinCoin, reason: "Loot Goblin coin", category: "enemy" });
    this.sfx("coin");
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  private update(dt: number) {
    this.time += dt;
    const p = this.player;
    if (this.screen === "camp") {
      this.updatePlayer(dt);
      this.updateInteractables(dt);
      this.updateEffects(dt);
      this.updateCamera(dt);
      const fire = this.interactables.find(it => it.prop === "fire");
      if (fire && !this.reducedMotion && Math.random() < 0.5) {
        this.particle({ x: fire.pos.x + (Math.random() - 0.5) * 24, y: fire.pos.y - 16, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 40, life: 1.2, size: 2, color: "#ffb347", kind: "pixel", drag: 0.5, gravity: -10 });
      }
      return;
    }
    if (p.dead) {
      p.deathTime += dt;
      if (p.deathTime > 1.2 && this.modal.kind === "none") this.setModal({ kind: "death" });
    } else {
      this.updatePlayer(dt);
    }
    this.updateRooms();
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updateInteractables(dt);
    this.updateEncounter();
    this.updateEffects(dt);
    this.updateCamera(dt);
    if (!p.dead && this.ui.pendingLevels > 0 && this.lockedRoom === null && this.modal.kind === "none") this.openLevelUp();
  }

  private autoAim(range: number): number | null {
    let best: Enemy | null = null, bestScore = Infinity;
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.roomId !== (this.lockedRoom ?? this.currentRoom)) continue;
      const d = dist(p.pos, e.pos);
      if (d > range) continue;
      const off = Math.abs(angleDiff(p.aim, angleTo(p.pos, e.pos)));
      const score = d * (1 + off * 0.9);
      // Short-range swings may reach around a corner; longer shots need a clear line.
      if (score < bestScore && (d < 110 || this.los(p.pos, e.pos))) { bestScore = score; best = e; }
    }
    return best ? angleTo(p.pos, best.pos) : null;
  }

  private aimFor(range: number): number {
    const p = this.player;
    if (this.input.mouseAiming()) {
      return angleTo(p.pos, { x: this.input.mouse.x + this.camera.x, y: this.input.mouse.y + this.camera.y });
    }
    return this.autoAim(range) ?? p.aim;
  }

  private updatePlayer(dt: number) {
    const p = this.player, s = this.stats, input = this.input;
    p.attackCd -= dt; p.boltCd -= dt; p.novaCd -= dt; p.dodgeCd -= dt; p.potionCd -= dt;
    p.iframes -= dt; p.hitFlash -= dt; p.chill -= dt; p.weakened -= dt; p.comboTimer -= dt;
    if (p.comboTimer <= 0) p.combo = 0;
    p.energy = Math.min(s.energyMax, p.energy + s.energyRegen * dt);
    if (p.swing) { p.swing.t += dt; if (p.swing.t > p.swing.dur) p.swing = null; }
    p.orbit += dt * 3.2;

    const move = input.moveVector();
    if (this.input.mouseAiming()) p.aim = angleTo(p.pos, { x: input.mouse.x + this.camera.x, y: input.mouse.y + this.camera.y });
    else if (move.x || move.y) p.aim = Math.atan2(move.y, move.x);

    if (p.dodgeCharges < this.kit.dodge.charges && p.dodgeCd <= 0) {
      p.dodgeCharges++;
      if (p.dodgeCharges < this.kit.dodge.charges) p.dodgeCd = s.dodgeCd;
    }
    p.critT -= dt;
    if (input.consume("dodge") && p.dodgeCharges > 0) this.dodge(move);
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      this.moveCircle(p.pos, p.radius, p.dashDir.x * 1150 * dt, p.dashDir.y * 1150 * dt);
      if (s.powers.has("phaseWalker") && Math.random() < 0.6) {
        this.hazard({ shape: "circle", pos: { ...p.pos }, radius: 34, delay: 0, dmg: s.atk * 0.25, owner: "player", linger: 1.0, tick: 0.25, color: "#8f6fd8" });
      }
      if (!this.reducedMotion) this.particle({ x: p.pos.x, y: p.pos.y - 18, vx: 0, vy: 0, life: 0.25, size: 18, color: "#ccff0055", kind: "glow", drag: 0, gravity: 0 });
      p.vel = { x: p.dashDir.x * s.moveSpeed, y: p.dashDir.y * s.moveSpeed };
    } else {
      // A quick acceleration and a slightly quicker stop make movement feel smooth without feeling floaty.
      const speed = s.moveSpeed * (p.chill > 0 ? 0.65 : 1) * (p.swing ? 0.55 : 1);
      p.moving = Boolean(move.x || move.y);
      const k = 1 - Math.exp(-dt * (p.moving ? 22 : 28));
      p.vel.x += (move.x * speed - p.vel.x) * k;
      p.vel.y += (move.y * speed - p.vel.y) * k;
      // Snap a fading axis to zero so straight moves stay straight and corner sliding still works.
      if (!move.x && Math.abs(p.vel.x) < 12) p.vel.x = 0;
      if (!move.y && Math.abs(p.vel.y) < 12) p.vel.y = 0;
      if (Math.abs(p.vel.x) + Math.abs(p.vel.y) > 2) {
        const hit = this.moveCircle(p.pos, p.radius, p.vel.x * dt, p.vel.y * dt);
        if (hit.hitX) p.vel.x = 0;
        if (hit.hitY) p.vel.y = 0;
      } else p.vel = { x: 0, y: 0 };
      if (p.moving) p.walkTime += dt;
      if (p.moving && this.worn.trail !== "trail-none" && !this.reducedMotion && (p.trailT += dt) > 0.07) { p.trailT = 0; this.trailParticle(); }
    }
    const faceAngle = p.swing ? p.swing.angle : p.moving ? Math.atan2(move.y, move.x) : p.aim;
    const fx = Math.cos(faceAngle), fy = Math.sin(faceAngle);
    p.facing = Math.abs(fx) >= Math.abs(fy) ? (fx < 0 ? "left" : "right") : fy < 0 ? "up" : "down";
    if (p.facing === "left" || p.facing === "right") p.side = p.facing;

    if ((input.consume("attack") || input.attackHeld()) && p.attackCd <= 0 && p.dashTime <= 0) this.attack();
    if ((input.consume("bolt") || input.boltHeld()) && p.boltCd <= 0) this.castBolt();
    if (input.consume("nova") && p.novaCd <= 0) this.castSignature();
    if (input.consume("potion")) this.drinkPotion();
    if (input.consume("interact")) this.interact();
    if (this.screen === "camp") {
      if (input.consume("character")) this.openCampPanel("friend");
      if (input.consume("log")) this.openCampPanel("rf");
      if (input.consume("pause")) this.openCampPanel("descend");
    } else {
      if (input.consume("character")) this.setModal({ kind: "character" });
      if (input.consume("log")) this.setModal({ kind: "log" });
      if (input.consume("pause")) this.setModal({ kind: "pause" });
    }

    if (s.powers.has("runeOrbit") || s.powers.has("voidHeart")) {
      for (let i = 0; i < 3; i++) {
        const a = p.orbit + (i / 3) * TAU, o = { x: p.pos.x + Math.cos(a) * 58, y: p.pos.y - 14 + Math.sin(a) * 58 };
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || e.orbitHitT > this.time || dist(o, e.pos) > e.radius + 10) continue;
          e.orbitHitT = this.time + 0.4;
          this.dealDamage(e, s.atk * 0.45, { source: "orbit", knock: 80, from: p.pos });
        }
      }
    }
  }

  private attack() {
    const p = this.player, s = this.stats;
    p.combo = (p.combo + 1) % 3;
    p.comboTimer = 0.9;
    const heavy = p.combo === 0;
    p.strikes++;
    const edge = s.powers.has("rareEdge") && p.strikes % 4 === 0;
    const style = this.kit.attack;
    const angle = this.aimFor(style.range + 90);
    p.aim = angle;
    const range = style.range * (heavy ? 1.15 : 1), arc = Math.min(Math.PI * 2, style.arc * (heavy ? 1.18 : 1));
    if (style.step) this.moveCircle(p.pos, p.radius, Math.cos(angle) * style.step, Math.sin(angle) * style.step);
    p.swing = { t: 0, dur: style.id === "whirl" ? 0.22 : 0.16, angle, arc, range, heavy };
    p.attackCd = style.cd;
    this.sfx(heavy ? "heavySwing" : "swing");
    if (heavy) this.audio.friendVoice("heavy");
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (inCone(p.pos, angle, arc, range, e.pos, e.radius)) {
        hits++;
        this.dealDamage(e, s.atk * style.dmg * (heavy ? 1.5 : 1), { source: "melee", knock: heavy ? 240 : style.knock, from: p.pos, forceCrit: edge });
      }
    }
    if (hits) p.energy = Math.min(s.energyMax, p.energy + 3 * Math.min(3, hits));
    if (edge) {
      this.fire({ pos: { ...p.pos }, vel: fromAngle(angle, 520), radius: 16, dmg: s.atk * 1.2, owner: "player", life: 0.6, color: "#ccff00", kind: "wave", pierce: 99 });
    }
    this.strikeSecretWalls(angle, range + 30);
  }

  private castBolt() {
    const p = this.player, s = this.stats;
    const bolt = this.kit.bolt;
    if (p.energy < bolt.energy) { if (this.input.consume("bolt")) this.toast("Not enough energy", "#8f6fd8"); return; }
    p.energy -= bolt.energy;
    p.boltCd = bolt.cd;
    const angle = this.aimFor(bolt.speed * bolt.life * 0.9);
    p.aim = angle;
    const n = bolt.count + s.projectiles - 1;
    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * bolt.spread;
      this.fire({ pos: { x: p.pos.x + Math.cos(a) * 16, y: p.pos.y - 12 + Math.sin(a) * 16 }, vel: fromAngle(a, bolt.speed), radius: bolt.radius,
        dmg: s.atk * bolt.dmg * s.boltMult, owner: "player", life: bolt.life, color: bolt.color, kind: bolt.id === "shards" ? "shard" : "bolt", pierce: bolt.pierce });
    }
    this.sfx("bolt");
  }

  private castNova(free = false) {
    const p = this.player, s = this.stats;
    if (!free) {
      if (p.energy < 40) { this.toast("Nova needs 40 energy", "#8f6fd8"); this.sfx("deny"); return; }
      p.energy -= 40;
      p.novaCd = 3.5;
    }
    const radius = 150 * Math.sqrt(s.novaMult);
    this.hazard({ shape: "circle", pos: { ...p.pos }, radius, delay: 0, dmg: s.atk * 1.7 * s.novaMult, owner: "player", color: "#ccff00", knock: 380 });
    if (s.powers.has("novaEcho")) this.hazard({ shape: "circle", pos: { ...p.pos }, radius: radius * 1.15, delay: 0.35, dmg: s.atk * 1.2 * s.novaMult, owner: "player", color: "#ccff00", knock: 300 });
    this.sfx("nova");
    this.shake(6);
    this.particle({ x: p.pos.x, y: p.pos.y - 10, vx: 0, vy: 0, life: 0.45, size: radius, color: "#ccff00", kind: "ring", drag: 0, gravity: 0 });
    this.burst(p.pos.x, p.pos.y - 10, "#ccff00", 30, 320);
    this.strikeSecretWalls(null, radius);
  }

  /** The Friend's family signature ability on R. */
  private castSignature() {
    const p = this.player, s = this.stats, sig = this.kit.signature;
    if (sig.id === "nova") { this.castNova(); return; }
    if (p.energy < sig.energy) { this.toast(`${sig.name} needs ${sig.energy} energy`, "#8f6fd8"); this.sfx("deny"); return; }
    p.energy -= sig.energy;
    p.novaCd = sig.cd;
    this.audio.friendVoice("signature");
    const atk = s.atk * s.novaMult, aim = this.aimFor(320), at = (a: number, d: number) => ({ x: p.pos.x + Math.cos(a) * d, y: p.pos.y + Math.sin(a) * d });
    p.aim = aim;
    const ring = (x: number, y: number, r: number) => this.particle({ x, y: y - 10, vx: 0, vy: 0, life: 0.45, size: r, color: sig.color, kind: "ring", drag: 0, gravity: 0 });
    switch (sig.id) {
      case "boneSpikes":
        for (const off of [-0.38, 0, 0.38]) {
          this.hazard({ shape: "line", pos: { ...p.pos }, angle: aim + off, length: 250, width: 36, delay: 0.12, dmg: atk * 1.5, owner: "player", color: sig.color, knock: 160 });
          for (let d = 30; d < 250; d += 30) { const q = at(aim + off, d); this.particle({ x: q.x, y: q.y, vx: 0, vy: -60, life: 0.4, size: 5, color: sig.color, kind: "pixel", drag: 2, gravity: 0 }); }
        }
        this.sfx("slam"); this.shake(5); break;
      case "masquerade":
        p.iframes = Math.max(p.iframes, 1.5); p.critT = 4;
        this.burst(p.pos.x, p.pos.y - 16, sig.color, 30, 220); ring(p.pos.x, p.pos.y, 90); this.sfx("blink");
        this.toast("MASQUERADE: untouchable, +40% crit", sig.color); break;
      case "rally":
        this.heal(s.maxHp * 0.18);
        this.hazard({ shape: "circle", pos: { ...p.pos }, radius: 200, delay: 0, dmg: atk * 0.5, owner: "player", color: sig.color, knock: 440 });
        ring(p.pos.x, p.pos.y, 200); this.sfx("potion"); break;
      case "mitosis":
        for (let i = 0; i < 8; i++) this.fire({ pos: { ...p.pos }, vel: fromAngle(aim + (i / 8) * TAU, 420), radius: 9, dmg: atk * 0.8, owner: "player", life: 0.9, color: sig.color, kind: "orb", pierce: 2 });
        this.sfx("summon"); break;
      case "chaosRift": {
        const center = at(aim, 170);
        for (let i = 0; i < 4; i++) {
          const pos = { x: center.x + (Math.random() - 0.5) * 180, y: center.y + (Math.random() - 0.5) * 180 };
          this.hazard({ shape: "circle", pos, radius: 80, delay: 0.2 + i * 0.12, dmg: atk * (0.7 + Math.random() * 1), owner: "player", color: sig.color, knock: 220 });
        }
        this.sfx("charge"); break;
      }
      case "phaseBlink": {
        const from = { ...p.pos };
        let dest = { ...p.pos };
        for (let d = 10; d <= 230; d += 10) { const q = at(aim, d); if (this.circleBlocked(q.x, q.y, p.radius)) break; dest = q; }
        this.hazard({ shape: "circle", pos: from, radius: 90, delay: 0, dmg: atk * 1.1, owner: "player", color: sig.color, knock: 200 });
        p.pos = dest; p.iframes = Math.max(p.iframes, 0.35);
        this.hazard({ shape: "circle", pos: { ...dest }, radius: 100, delay: 0.05, dmg: atk * 1.3, owner: "player", color: sig.color, knock: 260 });
        this.burst(from.x, from.y - 16, sig.color, 20, 200); ring(dest.x, dest.y, 100); this.sfx("blink"); break;
      }
      case "earthshatter":
        this.hazard({ shape: "circle", pos: { ...p.pos }, radius: 190, delay: 0.15, dmg: atk * 2.6, owner: "player", color: sig.color, knock: 460 });
        ring(p.pos.x, p.pos.y, 190); this.burst(p.pos.x, p.pos.y, sig.color, 40, 340); this.sfx("slam"); this.shake(12); break;
      case "prismBurst":
        for (let i = 0; i < 12; i++) {
          const a = aim + (i / 12) * TAU, colors = ["#ff3d7f", "#ccff00", "#3ef0ff", "#ffb02e"];
          this.fire({ pos: { ...p.pos }, vel: fromAngle(a, 560), radius: 7, dmg: atk * 0.7, owner: "player", life: 0.75, color: colors[i % 4], kind: "bolt" });
        }
        this.sfx("bolt"); break;
      case "voidPull":
        this.hazard({ shape: "circle", pos: { ...p.pos }, radius: 280, delay: 0, dmg: 0, owner: "player", color: sig.color, knock: -520 });
        this.hazard({ shape: "circle", pos: { ...p.pos }, radius: 130, delay: 0.45, dmg: atk * 1.9, owner: "player", color: sig.color, knock: 300 });
        ring(p.pos.x, p.pos.y, 280); this.sfx("summon"); this.shake(4); break;
    }
    this.strikeSecretWalls(null, 160);
  }

  private dodge(move: Vec) {
    const p = this.player, s = this.stats;
    const dir = move.x || move.y ? move : fromAngle(p.aim);
    p.dashDir = dir;
    p.dashTime = 0.18 * this.kit.dodge.distance;
    if (p.dodgeCharges === this.kit.dodge.charges) p.dodgeCd = s.dodgeCd;
    p.dodgeCharges--;
    p.iframes = Math.max(p.iframes, 0.25 + (s.powers.has("nullSignal") ? 0.3 : 0));
    this.sfx("dodge");
    this.audio.friendVoice("dodge");
    if (s.powers.has("nullSignal")) this.castNova(true);
  }

  private drinkPotion() {
    const p = this.player, s = this.stats;
    if (p.potionCd > 0) return;
    if (p.potions <= 0) { this.toast("No potions left", "#ff6a7d"); this.sfx("deny"); return; }
    if (p.hp >= s.maxHp) { this.toast("Already at full health", "#b9b3c9"); return; }
    p.potions--;
    p.potionCd = 0.8;
    this.heal(s.maxHp * 0.3);
    this.sfx("potion");
    this.burst(p.pos.x, p.pos.y - 16, "#ff4d6d", 16, 120);
  }

  heal(amount: number) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + amount);
    const gained = Math.round(p.hp - before);
    if (gained > 0) this.floater(p.pos.x, p.pos.y - 40, `+${gained}`, "#6ee07a", 15);
  }

  dealDamage(e: Enemy, base: number, o: { source: "melee" | "bolt" | "nova" | "burn" | "orbit" | "trail" | "wave"; knock?: number; from?: Vec; forceCrit?: boolean }) {
    if (e.dead || e.spawnT > 0) return;
    if (e.invulnT > 0) { this.floater(e.pos.x, e.pos.y - e.radius - 20, "IMMUNE", "#9aa3b8", 12); return; }
    if (e.shield > 0 && o.source !== "burn") {
      e.shield--; e.shieldCd = 5; e.hitFlash = 0.08;
      this.floater(e.pos.x, e.pos.y - e.radius - 20, e.shield ? "BLOCKED" : "SHIELD BROKEN", "#4fb0ff", 13);
      this.burst(e.pos.x, e.pos.y - e.radius * 0.6, "#4fb0ff", e.shield ? 6 : 18, 180);
      this.sfx("hit", 0.6);
      return;
    }
    const s = this.stats, p = this.player;
    const crit = o.source !== "burn" && (o.forceCrit || Math.random() * 100 < s.critChance + (p.critT > 0 ? 40 : 0));
    let mult = s.dmgMult;
    if (p.hp / s.maxHp < 0.35) mult *= 1 + s.lowHpDmg / 100;
    if (p.weakened > 0) mult *= 0.8;
    if (s.powers.has("executioner") && e.hp / e.maxHp < 0.25) mult *= 2;
    if (e.mods.includes("armored")) mult *= 0.7;
    if (e.stunT > 0 && e.boss) mult *= 1.5;
    const dmg = Math.max(1, Math.round(base * mult * (crit ? s.critDmg / 100 : 1) * (0.92 + Math.random() * 0.16)));
    e.hp -= dmg;
    e.hitFlash = 0.1;
    if (o.knock && o.from) {
      const resist = e.boss || e.speed === 0 ? 0.12 : e.elite || e.kind === "brute" ? 0.45 : 1;
      const dir = normalize(e.pos.x - o.from.x, e.pos.y - o.from.y);
      e.knock.x += dir.x * o.knock * resist;
      e.knock.y += dir.y * o.knock * resist;
    }
    const color = o.source === "burn" ? "#ff9a3c" : crit ? "#ffd23c" : "#ffffff";
    this.floater(e.pos.x, e.pos.y - e.radius - 18, crit ? `${dmg}!` : `${dmg}`, color, crit ? 22 : o.source === "burn" ? 13 : 16);
    if (o.source !== "burn") {
      this.burst(e.pos.x, e.pos.y - e.radius * 0.6, crit ? "#ffd23c" : e.elite ? "#ff2e4d" : "#c9b8ff", crit ? 12 : 6, crit ? 240 : 170);
      this.sfx(crit ? "crit" : "hit");
      if (crit && !this.reducedMotion) { this.hitStop = Math.max(this.hitStop, 0.04); this.shake(3); }
      if (s.lifesteal > 0) this.heal(dmg * s.lifesteal / 100);
      if (Math.random() * 100 < s.burnChance) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, s.atk * 0.32); }
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const run = this.run, s = this.stats;
    if (run) { run.kills++; if (e.elite) run.elites++; }
    this.gainXp(e.xp);
    if (s.healOnKill > 0) this.heal(s.healOnKill);
    this.sfx("enemyDie");
    this.burst(e.pos.x, e.pos.y - e.radius * 0.5, e.boss ? "#ccff00" : e.elite ? "#ff2e4d" : "#8f6fd8", e.boss ? 80 : e.elite ? 30 : 16, e.boss ? 360 : 220);
    this.particle({ x: e.pos.x, y: e.pos.y - e.radius * 0.5, vx: 0, vy: 0, life: 0.35, size: e.radius * 2.4, color: e.elite ? "#ff2e4d" : "#8f6fd8", kind: "ring", drag: 0, gravity: 0 });
    if (s.powers.has("voidHeart")) this.hazard({ shape: "circle", pos: { ...e.pos }, radius: 80, delay: 0.05, dmg: s.atk * 0.8, owner: "player", color: "#ff3d7f", knock: 200 });
    if (e.mods.includes("explosive")) this.hazard({ shape: "circle", pos: { ...e.pos }, radius: 90, delay: 0.7, dmg: e.dmg * 1.3, color: "#ff9a3c", source: e });
    if (e.mods.includes("cursed")) this.hazard({ shape: "circle", pos: { ...e.pos }, radius: 60, delay: 0.3, dmg: e.dmg * 0.2, linger: 3, tick: 0.5, color: "#7a2cff", curse: true });
    if (e.boss) { this.bossDefeated(e); return; }
    this.corpses.push({ e, t: 0.4 });
    if (e.kind === "bomber") this.hazard({ shape: "circle", pos: { ...e.pos }, radius: 66, delay: 0.35, dmg: e.dmg * 0.6, color: "#ff9a3c", source: e, knock: 200 });
    if (e.mods.includes("splitting") && !e.minion && e.kind !== "goblin") {
      for (let i = 0; i < 2; i++) {
        // Split-offs are plain minions: never elites, so they pay no elite RF.
        const child = this.spawn(e.kind, { x: e.pos.x + (i ? 16 : -16), y: e.pos.y }, e.roomId, { minion: true, elite: false });
        child.spawnT = 0.2;
      }
    }
    if (e.kind === "bloodling" && !e.minion) {
      for (let i = 0; i < 2; i++) {
        const child = this.spawn("bloodling", { x: e.pos.x + (i ? 14 : -14), y: e.pos.y }, e.roomId, { minion: true });
        child.spawnT = 0.15; child.radius = 10;
      }
    }
    const luck = s.luck + s.lootDrops;
    if (e.bounty === "voidHunt") {
      this.dropItem(e.pos, generateItem(this.rng, this.depth, { rarity: "legendary" }));
      this.dropPickup("rf", e.pos, { amount: RF_REWARDS.rareEvent, reason: "Void hunt bounty", category: "event-reward" });
    }
    if (e.elite) {
      this.dropPickup("rf", e.pos, { amount: RF_REWARDS.elite, reason: "Elite defeated", category: "elite" });
    } else if (e.kind === "goblin") {
      if (e.coins < RF_GOBLIN_MAX_COINS) this.dropPickup("rf", e.pos, { amount: RF_REWARDS.goblinCoin, reason: "Loot Goblin coin", category: "enemy" });
      for (let i = 0; i < 2; i++) this.dropItem(e.pos, generateItem(this.rng, this.depth, { rarity: rollRarity(this.rng, this.depth * 0.08 + luck / 100 + 0.5, "uncommon") }));
      this.dropPickup("potion", e.pos, {});
      this.toast("LOOT GOBLIN SLAIN!", "#ccff00");
    } else if (Math.random() < RF_NORMAL_ENEMY_CHANCE * (1 + s.rfFind / 100) * (e.champion ? 2 : 1)) {
      this.dropPickup("rf", e.pos, { amount: RF_REWARDS.enemy, reason: `${titleCase(e.name)} defeated`, category: "enemy" });
    }
    const frenzy = this.buffs.some(b => b.id === "lootFrenzy") ? 2 : 1;
    const itemChance = (e.elite ? 0.65 : e.champion ? 0.2 : 0.045) * (1 + luck / 100) * frenzy;
    if (e.kind !== "goblin" && Math.random() < itemChance) {
      const boost = this.depth * 0.08 + luck / 100 + (e.elite ? 0.5 : e.champion ? 0.25 : 0);
      this.dropItem(e.pos, generateItem(this.rng, this.depth, { rarity: rollRarity(this.rng, boost, e.elite ? "uncommon" : "common") }));
    }
    if (Math.random() < (e.elite ? 0.2 : 0.025)) this.dropPickup("potion", e.pos, {});
  }

  private gainXp(amount: number) {
    const p = this.player;
    p.xp += amount;
    let pending = this.ui.pendingLevels;
    while (p.xp >= xpForLevel(this.level)) {
      p.xp -= xpForLevel(this.level);
      this.level++;
      pending++;
      this.refreshStats();
      this.heal(this.stats.maxHp * 0.06);
      this.sfx("levelUp");
      this.audio.friendVoice("happy");
      this.audio.cue("action-ready");
      this.burst(p.pos.x, p.pos.y - 20, "#ccff00", 40, 260);
      this.banner(`LEVEL ${this.level}`, "Choose an upgrade when the room is clear", "#ccff00", "level");
    }
    if (pending !== this.ui.pendingLevels) this.patch({ pendingLevels: pending });
  }

  private openLevelUp() {
    const options = this.rng.shuffle((Object.keys(BOONS) as BoonId[]).filter(id => (this.boons.get(id) ?? 0) < (BOONS[id].max ?? 99))).slice(0, 3);
    this.setModal({ kind: "levelUp", options });
  }

  chooseBoon(id: BoonId) {
    if (this.modal.kind !== "levelUp" || !this.modal.options.includes(id)) return;
    this.boons.set(id, (this.boons.get(id) ?? 0) + 1);
    this.refreshStats();
    if (id === "potionBelt") this.player.potions = Math.min(this.stats.potionMax, this.player.potions + 1);
    if (id === "vitality") this.heal(20);
    this.sfx("pickup");
    this.audio.cue("select");
    const pending = this.ui.pendingLevels - 1;
    this.patch({ pendingLevels: pending, modal: { kind: "none" } });
    this.toast(`${BOONS[id].name}: ${BOONS[id].text}`, "#ccff00");
  }

  hurtPlayer(amount: number, source: Enemy | null, options: { slow?: boolean; curse?: boolean; certain?: boolean } = {}) {
    const p = this.player, s = this.stats;
    if (p.dead || p.iframes > 0 || this.screen !== "run") return;
    if (!options.certain && Math.random() * 100 < s.evasion) { this.floater(p.pos.x, p.pos.y - 44, "DODGE", "#8fe3ff", 14); p.iframes = 0.2; return; }
    const reduced = amount * (1 - s.armor / (s.armor + 100)) * s.damageTaken;
    const dmg = Math.max(1, Math.round(reduced));
    p.hp -= dmg;
    p.iframes = 0.45;
    this.lastHitBy = source?.name ?? "a trap";
    this.damageTally.set(this.lastHitBy, (this.damageTally.get(this.lastHitBy) ?? 0) + dmg);
    p.hitFlash = 0.15;
    if (options.slow) p.chill = 2;
    if (options.curse) { p.weakened = 4; this.floater(p.pos.x, p.pos.y - 60, "CURSED", "#bb66ff", 13); }
    if (source?.mods.includes("vampiric") && !source.dead) source.hp = Math.min(source.maxHp, source.hp + dmg * 0.5);
    this.floater(p.pos.x, p.pos.y - 44, `-${dmg}`, "#ff4d6d", 18);
    this.sfx("playerHurt");
    this.audio.friendVoice("hurt");
    this.shake(5);
    this.burst(p.pos.x, p.pos.y - 16, "#ff2e4d", 10, 160);
    if (p.hp <= 0) this.playerDied();
  }

  private playerDied() {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.deathTime = 0;
    p.swing = null;
    p.dashTime = 0;
    this.input.clear();
    this.sfx("death");
    this.audio.setRoomSong(null);
    this.audio.setMusicMode("none");
    this.burst(p.pos.x, p.pos.y - 16, "#f3eeff", 50, 260);
    this.shake(10);
  }

  private updateRooms() {
    const floor = this.floor;
    if (!floor) return;
    const room = roomAt(floor, this.player.pos);
    const id = room?.id ?? null;
    if (id !== this.currentRoom) {
      this.currentRoom = id;
      if (room) this.onEnterRoom(room);
    }
    this.refreshRoomMusic();
    // Close the doors once the player is fully inside an uncleared fighting room.
    if (room && !room.cleared && this.lockedRoom === null && !this.player.dead && isFightRoom(room)) {
      const inset = TILE * 1.6, p = this.player.pos, r = this.roomRect(room.id);
      if (p.x > r.x + inset && p.x < r.x + r.w - inset && p.y > r.y + inset && p.y < r.y + r.h - inset) this.startEncounter(room);
    }
  }

  private onEnterRoom(room: Room) {
    const floor = this.floor!;
    if (!room.visited) {
      room.visited = true;
      room.known = true;
      if (room.type !== "start") {
        for (const buff of this.buffs) if (buff.rooms !== undefined) buff.rooms--;
        const expired = this.buffs.filter(b => b.rooms !== undefined && b.rooms <= 0);
        if (expired.length) {
          this.buffs = this.buffs.filter(b => !expired.includes(b));
          this.refreshStats();
          for (const b of expired) this.toast(`${b.name} faded`, "#9a93ad");
        }
      }
      for (const id of room.connections) {
        const c = floor.connections[id];
        const other = floor.rooms[c.a === room.id ? c.b : c.a];
        if (c.kind !== "secret" || c.open) other.known = true;
      }
      if (!isFightRoom(room)) room.cleared = true;
      if (room.type === "secret") {
        this.banner("SECRET ROOM", "Something was hidden here", "#ccff00", "clear");
        void this.grant(RF_REWARDS.rareEvent, "Secret room discovered", "event-reward");
        this.addInteractable({ kind: "chest", pos: roomCenter(room), radius: 22, roomId: room.id, label: "SECRET CACHE",
          chest: { kind: "treasure", minRarity: "rare", boost: 0.8, rerolls: 0, rfPaid: true } });
      }
      if (room.type === "shrine" && room.shrine === "void") this.toast("Something vast is listening…", "#ff3d7f");
      if (room.type === "merchant") this.toast("“Come closer, little Friend. Everything has a price.”", "#ffb02e");
    }
  }

  private startEncounter(room: Room, custom?: Encounter) {
    const encounter = custom ?? this.planEncounter(room);
    this.encounter = encounter;
    this.lockedRoom = room.id;
    this.recomputeBarriers();
    this.sfx("doorLock");
    this.shake(3);
    if (room.type === "boss") {
      const kind: EnemyKind = this.depth % 9 === 0 ? "beast" : "warden";
      const boss = this.spawn(kind, { x: roomCenter(room).x, y: roomCenter(room).y - 60 }, room.id);
      this.boss = boss;
      this.audio.setMusicMode("boss");
      this.sfx("roar");
      this.banner(boss.name, `${this.friend.label} vs ${boss.name}`, kind === "beast" ? "#ccff00" : "#ff2e4d", "boss");
      encounter.waves = [];
    } else this.spawnWave(encounter);
  }

  private planEncounter(room: Room): Encounter {
    const d = this.depth, run = this.run!;
    const budget = room.type === "bonus" ? (5 + d * 1.6) * 1.3 : d === 1 ? [5, 6, 7][Math.min(2, run.combatRoomsCleared)] : 5 + d * 1.5;
    // Each floor draws from its own roster (see FLOOR_THEMES); stationary shooters are capped per wave.
    const roster = this.floor!.band.roster;
    const normals = (points: number): Wave => {
      const wave: Wave = [];
      let left = points, stationary = 0;
      while (left > 0.5) {
        let kind: RosterKind = this.rng.weighted(roster);
        if (STATIONARY.has(kind) && ++stationary > 2) kind = "cursed";
        const champion = d > 1 && kind !== "mite" && this.rng.chance(Math.min(0.3, 0.05 + d * 0.025));
        const options: SpawnOptions = champion ? { champion: true, mods: rollModifiers(this.rng, 1) } : {};
        if (kind === "mite") for (let i = 0; i < 4; i++) wave.push({ kind, options: {} });
        else wave.push({ kind, options });
        left -= ENEMY_COST[kind];
      }
      return wave;
    };
    const elite = (mods: number): Wave[number] => ({ kind: "corrupted", options: { elite: true, mods: rollModifiers(this.rng, mods) } });
    const eliteMods = d < 4 ? 1 : d < 7 ? 2 : 3;
    let waves: Wave[];
    let chestKind: ChestKind | undefined;
    if (d === 1 && run.combatRoomsCleared === 0) waves = [[{ kind: "cursed", options: {} }, { kind: "cursed", options: {} }, { kind: "cursed", options: {} }]];
    else if (room.type === "elite") { waves = [[elite(eliteMods), ...normals(budget * 0.5)]]; chestKind = "elite"; }
    else if (room.type === "bonus" && room.bonus === "cursed") { waves = [[elite(Math.min(3, eliteMods + 1)), ...(d >= 4 ? [elite(eliteMods)] : normals(3))]]; chestKind = "elite"; }
    else if (room.type === "bonus" && room.bonus === "abyssal") { waves = [normals(budget), [elite(eliteMods), ...normals(budget * 0.6)], [elite(eliteMods + 1), elite(eliteMods)]]; chestKind = "bonus"; }
    else if (room.type === "bonus") { waves = budget > 8 ? [normals(budget * 0.55), normals(budget * 0.55)] : [normals(budget)]; chestKind = "bonus"; }
    else waves = budget > 8.5 ? [normals(budget * 0.55), normals(budget * 0.55)] : [normals(budget)];
    // Loot Goblins can appear in ordinary rooms after the tutorial rooms.
    if (room.type === "combat" && (d > 1 || run.combatRoomsCleared >= 2) && this.rng.chance(0.12)) waves[0].push({ kind: "goblin", options: {} });
    const chestRoll = room.type === "combat" && (d === 1 && run.combatRoomsCleared === 1 ? true : this.rng.chance(0.42));
    return { roomId: room.id, waves, next: 0, reward: chestKind || chestRoll ? "chest" : "none", chestKind: chestKind ?? "reward", bonus: room.bonus };
  }

  private spawnWave(encounter: Encounter) {
    const wave = encounter.waves[encounter.next++];
    if (!wave) return;
    for (const spawn of wave) {
      const enemy = this.spawn(spawn.kind, this.randomFloorPoint(encounter.roomId, 200), encounter.roomId, spawn.options);
      if (spawn.options.mods?.includes("swarm") && !spawn.options.elite) {
        for (let i = 0; i < 2; i++) this.spawn("cursed", this.randomFloorPoint(encounter.roomId, 160), encounter.roomId, { minion: true });
      }
      void enemy;
    }
    if (encounter.next > 1) this.toast(`WAVE ${encounter.next}`, "#ff2e4d");
  }

  private updateEncounter() {
    const encounter = this.encounter;
    if (!encounter || this.player.dead) return;
    const alive = this.enemies.filter(e => !e.dead && e.roomId === encounter.roomId);
    if (alive.length <= 1 && encounter.next < encounter.waves.length && alive.every(e => e.kind === "goblin" || e.hp < e.maxHp * 0.5)) {
      this.spawnWave(encounter);
      return;
    }
    if (alive.length === 0 && encounter.next >= encounter.waves.length) this.clearEncounter(encounter);
  }

  private clearEncounter(encounter: Encounter) {
    const floor = this.floor!, room = floor.rooms[encounter.roomId], run = this.run!;
    this.encounter = null;
    this.lockedRoom = null;
    this.recomputeBarriers();
    this.sfx("doorOpen");
    const wasFight = !room.cleared;
    room.cleared = true;
    for (const pickup of this.pickups) if (pickup.kind === "rf") pickup.magnet = true;
    for (const proj of this.projectiles) if (proj.owner === "enemy") this.burst(proj.pos.x, proj.pos.y, proj.color, 2, 60);
    this.projectiles = this.projectiles.filter(proj => proj.owner === "player");
    if (wasFight && room.type !== "boss" && !run.firstLootGiven && this.depth === 1) {
      // The first fight always pays out a visible upgrade, so loot shows up in the first minute.
      run.firstLootGiven = true;
      this.dropItem(roomCenter(room), generateItem(this.rng, 1, { slot: "weapon", rarity: "uncommon" }));
      this.toast("Loot! Walk over it to pick it up.", "#6ee07a");
    }
    if (wasFight && room.type !== "boss") {
      run.combatRoomsCleared++;
      this.gainXp(4 * this.depth);
      this.heal(this.stats.maxHp * 0.02);
      this.banner("ROOM CLEARED", undefined, "#ccff00", "clear");
    }
    if (encounter.reward === "chest") {
      const kind = encounter.chestKind ?? "reward";
      const tier = encounter.bonus;
      const minRarity: Rarity = kind === "elite" ? "rare" : tier === "abyssal" ? "epic" : tier === "blood" ? "uncommon" : "common";
      const boost = kind === "elite" ? 0.7 : tier === "abyssal" ? 1.6 : tier === "blood" ? 0.45 : 0.15;
      this.addInteractable({ kind: "chest", pos: roomCenter(room), radius: 22, roomId: room.id, label: tier ? `${GATES[tier].name} SPOILS` : kind === "elite" ? "ELITE CHEST" : "REWARD CHEST",
        chest: { kind, minRarity, boost, rerolls: 0, rfPaid: true } });
      this.sfx("pickup");
    }
    if (encounter.reward === "horde") {
      void this.grant(RF_REWARDS.rareEvent, "Survived the horde", "event-reward");
      this.addInteractable({ kind: "chest", pos: roomCenter(room), radius: 22, roomId: room.id, label: "HORDE SPOILS", chest: { kind: "bonus", minRarity: "rare", boost: 0.9, rerolls: 0, rfPaid: true } });
    }
    if (encounter.reward === "arena") {
      this.addInteractable({ kind: "chest", pos: { x: roomCenter(room).x - 60, y: roomCenter(room).y }, radius: 22, roomId: room.id, label: "CURSED HOARD",
        chest: { kind: "cursed", minRarity: "legendary", boost: 1.4, rerolls: 0, rfPaid: true } });
      this.addInteractable({ kind: "stairs", pos: { x: roomCenter(room).x + 80, y: roomCenter(room).y }, radius: 34, roomId: room.id, label: "RETURN THROUGH THE RIFT" });
    }
    if (this.ui.pendingLevels > 0) this.openLevelUp();
  }

  private bossDefeated(e: Enemy) {
    const run = this.run!, floor = this.floor!;
    const room = floor.rooms[e.roomId];
    run.bosses.push(e.name);
    this.boss = null;
    this.audio.setMusicMode(this.placeMusic());
    this.audio.cue("reveal-legendary");
    this.shake(16);
    for (const other of this.enemies) if (!other.dead) { other.dead = true; this.burst(other.pos.x, other.pos.y, "#8f6fd8", 10); }
    this.projectiles = this.projectiles.filter(p => p.owner === "player");
    this.hazards = this.hazards.filter(h => h.owner === "player");
    this.banner(`${e.name} DEFEATED`, undefined, "#ccff00", "boss");
    const center = roomCenter(room);
    if (e.kind === "unminted") {
      void this.grant(RF_REWARDS.secretBoss, "Secret boss: The Unminted", "secret-boss");
      this.dropItem(center, generateItem(this.rng, this.depth, { rarity: this.rng.chance(0.4) ? "mythic" : "legendary" }));
      this.addInteractable({ kind: "stairs", pos: { x: center.x, y: center.y + 90 }, radius: 34, roomId: room.id, label: "RETURN THROUGH THE RIFT" });
    } else if (e.kind === "beast") {
      run.beastDefeated = true;
      void this.grant(RF_REWARDS.boss, "Boss: The Rare Beast", "boss");
      this.dropItem(center, generateItem(this.rng, this.depth, { rarity: this.rng.chance(0.3) ? "mythic" : "legendary" }));
    } else {
      void this.grant(RF_REWARDS.miniBoss, `Mini-boss: ${titleCase(e.name)}`, "boss");
      this.dropItem(center, generateItem(this.rng, this.depth, { rarity: rollRarity(this.rng, 1.2 + this.depth * 0.1, "epic") }));
    }
    if (e.kind !== "unminted") {
      this.addInteractable({ kind: "waystone", pos: { x: center.x - 90, y: center.y + 70 }, radius: 30, roomId: room.id, label: "WAYSTONE" });
      this.addInteractable({ kind: "stairs", pos: { x: center.x + 90, y: center.y + 70 }, radius: 34, roomId: room.id, label: "DESCEND DEEPER" });
      this.toast("A Waystone rises. Touch it to secure your loot.", "#ccff00");
    }
    this.clearEncounter({ roomId: room.id, waves: [], next: 0, reward: "none" });
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.hitFlash -= dt;
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }
      if (!p.dead) updateEnemy(e, this, dt);
      // Safeguard: nothing may hide in a doorway or wall of a locked room, so a fight can always be finished.
      if (e.roomId === this.lockedRoom && this.floor) {
        const r = this.roomRect(e.roomId);
        if (e.pos.x < r.x + 4 || e.pos.y < r.y + 4 || e.pos.x > r.x + r.w - 4 || e.pos.y > r.y + r.h - 4 || this.circleBlocked(e.pos.x, e.pos.y, Math.min(e.radius, 12))) {
          e.pos = this.randomFloorPoint(e.roomId, 120);
          e.knock = { x: 0, y: 0 };
        }
      }
      if (Math.abs(e.knock.x) + Math.abs(e.knock.y) > 1) {
        this.moveCircle(e.pos, e.radius, e.knock.x * dt, e.knock.y * dt);
        const decay = Math.exp(-dt * 9);
        e.knock.x *= decay; e.knock.y *= decay;
      }
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnTick += dt;
        if (e.burnTick >= 0.5) { e.burnTick = 0; this.dealDamage(e, e.burnDps * 0.5, { source: "burn" }); }
        if (!this.reducedMotion && Math.random() < 0.3) this.particle({ x: e.pos.x + (Math.random() - 0.5) * e.radius, y: e.pos.y - e.radius, vx: 0, vy: -50, life: 0.4, size: 3, color: "#ff9a3c", kind: "pixel", drag: 1, gravity: 0 });
      }
    }
    // Separation keeps crowds readable.
    const living = this.enemies.filter(e => !e.dead);
    for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
      const a = living[i], b = living[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) continue;
      const d = Math.sqrt(d2), push = (min - d) / 2;
      const nx = dx / d, ny = dy / d;
      const wa = a.boss ? 0.1 : 1, wb = b.boss ? 0.1 : 1;
      this.moveCircle(a.pos, a.radius, -nx * push * wa, -ny * push * wa);
      this.moveCircle(b.pos, b.radius, nx * push * wb, ny * push * wb);
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (const proj of this.projectiles) {
      proj.life -= dt;
      proj.pos.x += proj.vel.x * dt;
      proj.pos.y += proj.vel.y * dt;
      if (proj.burst && proj.life <= 0) { this.burstProjectile(proj); continue; }
      if (this.solidAt(proj.pos.x, proj.pos.y)) {
        if (proj.owner === "player") this.hitSecretWallAt(proj.pos, proj.dmg);
        if (proj.burst) { proj.pos.x -= proj.vel.x * dt; proj.pos.y -= proj.vel.y * dt; this.burstProjectile(proj); continue; }
        proj.life = 0;
        this.burst(proj.pos.x, proj.pos.y, proj.color, 5, 90);
        continue;
      }
      if (proj.owner === "player") {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || proj.hit.has(e.id)) continue;
          if (dist(proj.pos, e.pos) <= proj.radius + e.radius) {
            proj.hit.add(e.id);
            this.dealDamage(e, proj.dmg, { source: proj.kind === "wave" ? "wave" : "bolt", knock: 90, from: { x: proj.pos.x - proj.vel.x, y: proj.pos.y - proj.vel.y } });
            if (proj.pierce-- <= 0) { proj.life = 0; break; }
          }
        }
      } else if (!p.dead && dist(proj.pos, { x: p.pos.x, y: p.pos.y - 8 }) <= proj.radius + p.radius) {
        if (p.iframes <= 0) { this.hurtPlayer(proj.dmg, proj.source ?? null, { slow: proj.slow, curse: proj.curse }); proj.life = 0; }
      }
      if (!this.reducedMotion && proj.owner === "player" && Math.random() < 0.5) this.particle({ x: proj.pos.x, y: proj.pos.y, vx: 0, vy: 0, life: 0.18, size: proj.radius * 0.8, color: proj.color, kind: "glow", drag: 0, gravity: 0 });
    }
    this.projectiles = this.projectiles.filter(proj => proj.life > 0);
  }

  /** A lobbed glob pops into a ring of bullets. */
  private burstProjectile(proj: Projectile) {
    const b = proj.burst!;
    proj.life = 0;
    proj.burst = undefined;
    const offset = Math.random() * TAU;
    for (let i = 0; i < b.count; i++) {
      this.fire({ pos: { ...proj.pos }, vel: fromAngle(offset + (i / b.count) * TAU, b.speed), radius: 7, dmg: b.dmg, owner: "enemy", life: 4, color: b.color, kind: "orb", source: proj.source });
    }
    this.burst(proj.pos.x, proj.pos.y, b.color, 14, 160);
    this.sfx("explode", 0.6);
  }

  private hazardHits(h: Hazard, pos: Vec, r: number): boolean {
    switch (h.shape) {
      case "circle": case "ring": return dist(h.pos, pos) <= h.radius + r;
      case "cone": return inCone(h.pos, h.angle, h.arc, h.radius, pos, r);
      case "line": return segmentDistance(pos, h.pos, { x: h.pos.x + Math.cos(h.angle) * h.length, y: h.pos.y + Math.sin(h.angle) * h.length }) <= h.width / 2 + r;
    }
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      if (!h.fired) {
        h.delay -= dt;
        if (h.delay > 0) continue;
        h.fired = true;
        this.applyHazard(h);
        if (h.owner === "player" && h.telegraph > 0 && h.dmg > 0) {
          if (h.shape === "circle") this.particle({ x: h.pos.x, y: h.pos.y - 6, vx: 0, vy: 0, life: 0.4, size: h.radius, color: h.color, kind: "ring", drag: 0, gravity: 0 });
          this.burst(h.pos.x, h.pos.y, h.color, 14, 220);
        }
        if (h.owner === "enemy" && h.dmg > 0 && h.linger === 0) {
          this.sfx(h.color === "#ff9a3c" ? "explode" : "slam");
          this.shake(h.radius > 100 ? 7 : 4);
          const n = h.shape === "circle" ? 18 : 10;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            this.particle({ x: h.pos.x + Math.cos(a) * h.radius * 0.8, y: h.pos.y + Math.sin(a) * h.radius * 0.8, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 40, life: 0.5, size: 4, color: h.color, kind: "pixel", drag: 2, gravity: 80 });
          }
        }
      } else if (h.linger > 0) {
        h.linger -= dt;
        if (h.sweep) h.angle += h.sweep * dt;
        h.tickT += dt;
        if (h.tickT >= h.tick) { h.tickT = 0; this.applyHazard(h); }
      }
    }
    this.hazards = this.hazards.filter(h => !h.fired || h.linger > 0);
  }

  private applyHazard(h: Hazard) {
    const p = this.player;
    if (h.owner === "player") {
      for (const e of this.enemies) {
        if (e.dead || !this.hazardHits(h, e.pos, e.radius)) continue;
        if (h.dmg > 0) this.dealDamage(e, h.dmg, { source: h.linger > 0 ? "trail" : "nova", knock: h.knock, from: h.pos });
        else if (h.knock) { const dir = normalize(e.pos.x - h.pos.x, e.pos.y - h.pos.y); e.knock.x += dir.x * h.knock; e.knock.y += dir.y * h.knock; }
      }
      return;
    }
    if (p.dead || !this.hazardHits(h, p.pos, p.radius)) return;
    if (h.knock && h.shape === "ring") {
      const dir = normalize(p.pos.x - h.pos.x, p.pos.y - h.pos.y);
      this.moveCircle(p.pos, p.radius, dir.x * h.knock * 0.3, dir.y * h.knock * 0.3);
    }
    if (h.dmg > 0) {
      if (h.linger > 0) { if (p.iframes <= 0) { this.hurtPlayer(h.dmg, h.source ?? null, { slow: h.slow, curse: h.curse }); p.iframes = 0.25; } }
      else this.hurtPlayer(h.dmg, h.source ?? null, { slow: h.slow, curse: h.curse });
    }
  }

  private updatePickups(dt: number) {
    const p = this.player, s = this.stats;
    for (const pickup of this.pickups) {
      pickup.t += dt;
      pickup.delay -= dt;
      // Drops bounce off walls so loot never lands somewhere unreachable.
      const hit = this.moveCircle(pickup.pos, 8, pickup.vel.x * dt, pickup.vel.y * dt);
      if (hit.hitX) pickup.vel.x *= -0.4;
      if (hit.hitY) pickup.vel.y *= -0.4;
      const decay = Math.exp(-dt * 5);
      pickup.vel.x *= decay; pickup.vel.y *= decay;
      if (p.dead || pickup.delay > 0) continue;
      const d = dist(pickup.pos, p.pos);
      const magnetRange = pickup.kind === "rf" ? 130 + s.luck : pickup.kind === "potion" ? 80 : pickup.t > 0.5 ? 44 : 0;
      if (pickup.magnet || d < magnetRange) {
        const dir = normalize(p.pos.x - pickup.pos.x, p.pos.y - pickup.pos.y);
        const speed = pickup.magnet ? 700 : 480;
        pickup.pos.x += dir.x * speed * dt;
        pickup.pos.y += dir.y * speed * dt;
      }
      if (d < p.radius + 14) this.collect(pickup);
    }
    this.pickups = this.pickups.filter(pickup => pickup.t >= 0);
  }

  private collect(pickup: Pickup) {
    const p = this.player;
    if (pickup.kind === "rf") {
      pickup.t = -1;
      void this.grant(pickup.amount ?? 1, pickup.reason ?? "RF", pickup.category ?? "enemy");
      this.burst(pickup.pos.x, pickup.pos.y, "#ccff00", 8, 120);
    } else if (pickup.kind === "potion") {
      if (p.potions >= this.stats.potionMax) {
        if (p.hp >= this.stats.maxHp) return;
        this.heal(this.stats.maxHp * 0.12);
      } else { p.potions++; this.toast("+1 Health Potion", "#ff4d6d"); }
      pickup.t = -1;
      this.sfx("potion");
    } else if (pickup.kind === "item" && pickup.item) {
      if (pickup.t < 0.5) return;
      pickup.t = -1;
      this.acquireItem(pickup.item, "found");
    }
  }

  dropPickup(kind: Pickup["kind"], at: Vec, extra: Partial<Pickup>) {
    const a = Math.random() * TAU, speed = 90 + Math.random() * 90;
    this.pickups.push({ id: this.nextId++, kind, pos: { x: at.x, y: at.y }, vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed }, t: 0, magnet: false, delay: kind === "rf" ? 0.35 : 0.2, ...extra });
  }

  dropItem(at: Vec, item: Item) {
    this.dropPickup("item", at, { item, delay: 0.5 });
    if (rarityRank(item.rarity) >= 4) {
      this.banner(`${RARITY_STYLE[item.rarity].label} DROP`, item.name, RARITY_STYLE[item.rarity].color, "loot");
      this.audio.cue(item.rarity === "mythic" ? "reveal-legendary" : "reveal-rare");
      this.shake(8);
      this.burst(at.x, at.y, RARITY_STYLE[item.rarity].color, 60, 300);
    }
  }

  private updateInteractables(dt: number) {
    const p = this.player;
    let best: Interactable | null = null, bestD = Infinity;
    for (const it of this.interactables) {
      it.t += dt;
      if (p.dead) continue;
      const d = dist(p.pos, it.pos);
      if (d < it.radius + p.radius + 34 && d < bestD && this.isInteractable(it)) { best = it; bestD = d; }
    }
    const text = best ? this.promptFor(best) : null;
    const lift = best?.kind === "station" && best.station === "descend" ? 120 : best?.kind === "shrine" ? (best.shrine === "void" ? 140 : best.shrine === "fate" ? 118 : 70)
      : best?.kind === "event" && (best.event === "blackDoor" || best.event === "goldenDoor" || best.event === "mirror") ? 100 : best ? best.radius + 36 : 0;
    this.prompt = best && text ? { text, pos: { x: best.pos.x, y: best.pos.y - lift }, color: this.promptColor(best) } : null;
    const canInteract = Boolean(best && best.kind !== "secretWall");
    if (canInteract !== this.ui.canInteract) this.patch({ canInteract });
  }

  private isInteractable(it: Interactable) {
    if (it.kind === "secretWall") { const c = this.floor?.connections.find(c => c.kind === "secret" && dist(c.centerA, it.pos) < 2); return Boolean(c && !c.open); }
    if (it.kind === "gate") return !it.used;
    if (it.kind === "chest") return !it.used;
    if (it.kind === "prop") return false;
    if (it.kind === "event" || it.kind === "shrine") return true;
    return true;
  }

  private promptFor(it: Interactable): string {
    const key = this.ui.touch ? "" : "[E] ";
    switch (it.kind) {
      case "shrine": return it.used ? "The shrine is silent" : `${key}${SHRINES[it.shrine!].name} · ${SHRINES[it.shrine!].cost} RF`;
      case "gate": return `${key}${GATES[it.gate!.tier].name} · ${GATES[it.gate!.tier].cost} RF`;
      case "merchant": return `${key}TRADE WITH MOTH`;
      case "event": { if (it.used) return `${EVENTS[it.event!].name} · spent`; const cost = EVENTS[it.event!].cost; return `${key}${EVENTS[it.event!].name}${cost ? ` · ${cost} RF` : ""}`; }
      case "chest": return `${key}OPEN ${it.label}`;
      case "stairs": return `${key}${it.label}`;
      case "waystone": return `${key}TOUCH THE WAYSTONE`;
      case "secretWall": return "A cracked wall. Strike it!";
      case "station": return it.station === "descend" ? `${key}DESCEND THE GREAT STAIRS` : `${key}${it.label}`;
      case "prop": return "";
    }
  }
  private promptColor(it: Interactable) {
    if (it.kind === "shrine") return SHRINES[it.shrine!].color;
    if (it.kind === "gate") return GATES[it.gate!.tier].color;
    if (it.kind === "chest") return "#ffb02e";
    return "#ccff00";
  }

  interact() {
    const p = this.player;
    if (p.dead) return;
    let best: Interactable | null = null, bestD = Infinity;
    for (const it of this.interactables) {
      const d = dist(p.pos, it.pos);
      if (d < it.radius + p.radius + 34 && d < bestD && this.isInteractable(it) && it.kind !== "secretWall") { best = it; bestD = d; }
    }
    if (!best) return;
    this.sfx("ui");
    this.audio.cue("select");
    switch (best.kind) {
      case "shrine":
        if (best.used) { this.toast("The shrine is silent.", "#9a93ad"); return; }
        this.sfx("shrine");
        if (best.shrine === "void") this.audio.cue("anticipation");
        this.setModal({ kind: "shrine", id: best.id, tier: best.shrine! });
        return;
      case "gate": this.setModal({ kind: "gate", id: best.id, tier: best.gate!.tier }); return;
      case "merchant": this.setModal({ kind: "merchant", id: best.id }); return;
      case "event":
        if (best.used) { this.toast("Nothing more happens here.", "#9a93ad"); return; }
        this.setModal({ kind: "event", id: best.id, event: best.event! });
        return;
      case "chest": void this.openChest(best); return;
      case "stairs":
        if (best.label === "RETURN THROUGH THE RIFT") this.returnFromArena();
        else this.nextFloor();
        return;
      case "waystone": this.secureLoot(); this.setModal({ kind: "waystone" }); return;
      case "station": if (best.station) this.openCampPanel(best.station); return;
    }
  }

  // ─── Secret walls ──────────────────────────────────────────────────────────

  private strikeSecretWalls(angle: number | null, range: number) {
    for (const it of this.interactables) {
      if (it.kind !== "secretWall" || !this.isInteractable(it)) continue;
      const d = dist(this.player.pos, it.pos);
      if (d > range + 30) continue;
      if (angle !== null && Math.abs(angleDiff(angle, angleTo(this.player.pos, it.pos))) > 1.2) continue;
      this.damageSecretWall(it);
    }
  }
  private hitSecretWallAt(pos: Vec, _dmg: number) {
    for (const it of this.interactables) if (it.kind === "secretWall" && this.isInteractable(it) && dist(pos, it.pos) < 70) this.damageSecretWall(it);
  }
  private damageSecretWall(it: Interactable) {
    const c = this.floor!.connections.find(c => c.kind === "secret" && dist(c.centerA, it.pos) < 2);
    if (!c || c.open) return;
    c.secretHits++;
    this.shake(3);
    this.sfx("slam");
    this.burst(it.pos.x, it.pos.y, "#9a7fd1", 12, 160);
    if (c.secretHits >= 3) this.openSecret(c.id);
  }
  private openSecret(connectionId: number) {
    const floor = this.floor!;
    const c = floor.connections[connectionId];
    if (c.open) return;
    c.open = true;
    const room = floor.rooms[c.b];
    room.known = true; room.revealed = true;
    this.recomputeBarriers();
    this.renderer?.floorChanged();
    this.sfx("doorOpen");
    this.toast("A hidden passage opens!", "#ccff00");
    this.burst(c.centerA.x, c.centerA.y, "#ccff00", 30, 240);
  }

  // ─── Economy actions (called by the UI) ─────────────────────────────────────

  get isBusy() { return this.busy; }

  /** Spend through the economy; the outcome is granted only after the receipt resolves. */
  private async pay(amount: number, reason: string, category: RfCategory): Promise<boolean> {
    if (this.busy) return false;
    if (!this.economy.canAfford(rf(amount))) {
      this.sfx("deny");
      this.toast(`Need ${amount - wholeRf(this.economy.getBalance())} more RF`, "#ff6a7d");
      return false;
    }
    this.busy = true;
    this.patch({ busy: true });
    try {
      await this.economy.spend(rf(amount), reason, category);
      if (this.run) this.run.rfSpent += amount;
      this.sfx("spend");
      this.audio.cue("purchase");
      if (this.screen === "run") this.floater(this.player.pos.x, this.player.pos.y - 64, `-${amount} RF`, "#ff4d6d", 18);
      return true;
    } catch (error) {
      if (error instanceof InsufficientRfError) this.toast(error.message, "#ff6a7d");
      else this.toast("The offering failed. No RF was spent.", "#ff6a7d");
      return false;
    } finally {
      this.busy = false;
      this.patch({ busy: false });
    }
  }

  private async grant(amount: number, reason: string, category: RfCategory) {
    await this.economy.reward(rf(amount), reason, category);
    if (this.run) this.run.rfEarned += amount;
    this.sfx("coin");
    if (amount >= 5) this.audio.cue("reward");
    if (this.screen === "run") this.floater(this.player.pos.x, this.player.pos.y - 54, `+${amount} RF`, "#ccff00", amount >= 5 ? 22 : 17);
  }

  closeModal() {
    const modal = this.modal;
    if (modal.kind === "death" || modal.kind === "levelUp" || modal.kind === "waystone") return;
    if (modal.kind === "reveal" && modal.followUp) { this.followUp(modal.followUp, modal.followId); return; }
    this.setModal({ kind: "none" });
  }

  private followUp(kind: FollowUp, id?: number) {
    if (kind === "arena-unminted") { this.setModal({ kind: "none" }); this.enterArena("unminted"); }
    else if (kind === "arena-cursed") { this.setModal({ kind: "none" }); this.enterArena("cursed"); }
    else if (kind === "merchant" && id !== undefined) this.setModal({ kind: "merchant", id });
    else if (kind === "loot" && id !== undefined) this.setModal({ kind: "loot", id });
    else this.setModal({ kind: "none" });
  }

  private interactable(id: number) { return this.interactables.find(it => it.id === id); }

  async offerShrine() {
    const modal = this.modal;
    if (modal.kind !== "shrine") return;
    const shrine = this.interactable(modal.id);
    if (!shrine || shrine.used) return;
    const def = SHRINES[modal.tier];
    if (!(await this.pay(def.cost, titleCase(def.name), "shrine"))) return;
    shrine.used = true;
    const outcome = this.rng.table(def.outcomes);
    const suspense = modal.tier === "void" ? 2.2 : modal.tier === "fate" ? 1.1 : 0.6;
    const reveal = (title: string, lines: string[], tone: Extract<Modal, { kind: "reveal" }>["tone"], extra: Partial<Extract<Modal, { kind: "reveal" }>> = {}) =>
      this.setModal({ kind: "reveal", title, subtitle: def.name, lines, tone, suspense, ...extra });
    const s = this.stats;
    this.burst(shrine.pos.x, shrine.pos.y - 30, def.color, modal.tier === "void" ? 80 : 30, 280);
    switch (outcome.id) {
      case "might2": this.addBuff({ id: "might", name: "Greed's Might", kind: "blessing", mods: { dmgPct: 10 }, rooms: 2, color: "#ccff00", icon: "⚔" }); reveal("+10% DAMAGE", ["For the next 2 rooms."], "good"); break;
      case "heal15": this.heal(s.maxHp * 0.15); reveal("HEALED 15%", ["Warmth returns to your Friend."], "good"); break;
      case "swift": this.addBuff({ id: "swift", name: "Greed's Haste", kind: "blessing", mods: { moveSpeed: 5 }, floors: 1, color: "#ccff00", icon: "»" }); reveal("+5% MOVEMENT SPEED", ["Until you leave this floor."], "good"); break;
      case "reveal": this.revealFloor(false); reveal("THE FLOOR IS REVEALED", ["Every room on this floor now shows on your map."], "good"); break;
      case "lootBonus": {
        this.addBuff({ id: "lootBonus", name: "Greed's Eye", kind: "blessing", mods: { luck: 15 }, rooms: 2, color: "#ccff00", icon: "◆" });
        const item = generateItem(this.rng, this.depth, { rarity: rollRarity(this.rng, 0.4, "uncommon") });
        this.acquireItem(item, "shrine", true);
        reveal("SMALL LOOT BONUS", ["+15% loot chance for 2 rooms."], "good", { item });
        break;
      }
      case "might3": this.addBuff({ id: "fateMight", name: "Fate's Fury", kind: "blessing", mods: { dmgPct: 20 }, rooms: 3, color: "#4fb0ff", icon: "⚔" }); reveal("+20% DAMAGE", ["For the next 3 rooms."], "good"); break;
      case "fullHeal": this.heal(s.maxHp); reveal("FULLY HEALED", ["Fate mends every wound."], "good"); break;
      case "crit": this.addBuff({ id: "fateCrit", name: "Fate's Eye", kind: "blessing", mods: { critChance: 8 }, rooms: 3, color: "#4fb0ff", icon: "✦" }); reveal("+8% CRITICAL CHANCE", ["For the next 3 rooms."], "good"); break;
      case "rareChest": this.run!.nextChestMin = "rare"; reveal("FORTUNE AWAITS", ["Your next chest holds guaranteed Rare or better loot."], "good"); break;
      case "revealSecret": {
        const found = this.revealSecret();
        reveal(found ? "A SECRET ROOM" : "THE FLOOR IS REVEALED", [found ? "A hidden passage has opened somewhere on this floor. Check your map." : "This floor hides no secret room, so fate reveals every room instead."], "good");
        break;
      }
      case "lootFrenzy": this.addBuff({ id: "lootFrenzy", name: "Loot Frenzy", kind: "blessing", mods: { lootDrops: 100, luck: 10 }, rooms: 3, color: "#4fb0ff", icon: "◆" }); reveal("LOOT FRENZY", ["Enemies drop far more loot for the next 3 rooms."], "good"); break;
      case "legendary": { const item = generateItem(this.rng, this.depth, { rarity: "legendary" }); this.acquireItem(item, "shrine", true); reveal("LEGENDARY LOOT", ["The Void gives something back."], "legendary", { item }); break; }
      case "mythic": { const item = generateItem(this.rng, this.depth, { rarity: "mythic" }); this.acquireItem(item, "shrine", true); reveal("MYTHIC LOOT", ["The Void opens its hand. Almost no one sees this."], "mythic", { item }); break; }
      case "voidBlessing":
        this.addBuff({ id: "voidTouched", name: "VOID-TOUCHED", kind: "blessing", mods: { dmgPct: 25, critChance: 8, moveSpeed: 10 }, run: true, color: "#ff3d7f", icon: "◉" });
        reveal("VOID-TOUCHED", ["+25% damage, +8% critical chance, +10% speed.", "For the rest of this run."], "void");
        break;
      case "eliteHunt": {
        const room = this.floor!.rooms[shrine.roomId];
        reveal("THE VOID SENDS A HUNTER", ["An elite carrying huge rewards has entered the room.", "Slay it for Legendary loot and bonus RF."], "void");
        const elite = this.spawn("corrupted", this.pointNearPlayer(room.id, 160, 260), room.id, { elite: true, mods: rollModifiers(this.rng, Math.min(3, 1 + Math.ceil(this.depth / 3))) });
        elite.bounty = "voidHunt";
        elite.name = `VOID-HUNTING ${elite.name}`;
        this.startEncounter(room, { roomId: room.id, waves: [], next: 0, reward: "none" });
        break;
      }
      case "voidCurse":
        this.addBuff({ id: "voidCurse", name: "VOID CURSE", kind: "curse", mods: { hpPct: -30, damageTakenPct: 25 }, rooms: 3, color: "#7a2cff", icon: "☠" });
        reveal("A DANGEROUS CURSE", ["-30% max HP and +25% damage taken for the next 3 rooms.", "The Void takes, and gives nothing."], "bad");
        break;
      case "secretBoss":
        reveal("A SECRET BOSS ANSWERS", ["THE UNMINTED steps out of the dark.", "Defeat it for +25 RF and Mythic-grade loot."], "void", { followUp: "arena-unminted", action: "FACE IT" });
        break;
    }
  }

  async openGate() {
    const modal = this.modal;
    if (modal.kind !== "gate") return;
    const gate = this.interactable(modal.id);
    if (!gate || gate.used || !gate.gate) return;
    const def = GATES[modal.tier];
    if (!(await this.pay(def.cost, titleCase(def.name), "gate"))) return;
    gate.used = true;
    const c = this.floor!.connections[gate.gate.connection];
    c.open = true;
    this.floor!.rooms[c.b].known = true;
    this.recomputeBarriers();
    this.renderer?.floorChanged();
    this.sfx("doorOpen");
    this.shake(5);
    this.burst(gate.pos.x, gate.pos.y, def.color, 40, 260);
    this.setModal({ kind: "none" });
    this.toast(`${def.name} OPENED`, def.color);
  }

  async buy(offer: MerchantOffer) {
    const modal = this.modal;
    if (modal.kind !== "merchant") return;
    const merchant = this.interactable(modal.id);
    if (!merchant?.stock || (merchant.stock[offer] ?? 0) <= 0) return;
    const def = MERCHANT[offer];
    if (offer === "potion" && this.player.potions >= this.stats.potionMax) { this.toast("Your potion belt is full", "#ff6a7d"); this.sfx("deny"); return; }
    if (!(await this.pay(def.cost, `Merchant: ${titleCase(def.name)}`, "merchant"))) return;
    merchant.stock[offer]--;
    const back = { followUp: "merchant" as const, followId: merchant.id, suspense: 0, subtitle: "MOTH, THE PEDDLER", action: "BACK TO MOTH" };
    if (offer === "potion") { this.player.potions++; this.toast("+1 Health Potion", "#ff4d6d"); this.patch({}); return; }
    if (offer === "relic") {
      const rarity = RARITIES[Math.min(3, rarityRank(rollRarity(this.rng, 0.6, "uncommon")))];
      const item = generateItem(this.rng, this.depth, { slot: "relic", rarity });
      this.acquireItem(item, "merchant", true);
      this.setModal({ kind: "reveal", title: "RANDOM RELIC", lines: [], item, tone: "good", ...back });
    } else if (offer === "rareItem") {
      const item = generateItem(this.rng, this.depth, { rarity: "rare" });
      this.acquireItem(item, "merchant", true);
      this.setModal({ kind: "reveal", title: "RARE ITEM", lines: [], item, tone: "good", ...back });
    } else if (offer === "legendaryGamble") {
      const rarity = this.rng.table(LEGENDARY_GAMBLE).rarity;
      const item = generateItem(this.rng, this.depth, { rarity });
      this.acquireItem(item, "merchant", true);
      this.setModal({ kind: "reveal", title: rarity === "epic" ? "THE GAMBLE: EPIC" : rarity === "mythic" ? "THE GAMBLE: MYTHIC!" : "THE GAMBLE: LEGENDARY", lines: [], item,
        tone: rarity === "mythic" ? "mythic" : rarity === "legendary" ? "legendary" : "neutral", ...back, suspense: 1.2 });
    } else if (offer === "cursedBox") {
      const roll = this.rng.table(CURSED_BOX).id;
      if (roll === "cursedItem") {
        const item = generateItem(this.rng, this.depth, { rarity: rollRarity(this.rng, 0.8, "rare"), cursed: true });
        this.acquireItem(item, "merchant", true);
        this.setModal({ kind: "reveal", title: "A CURSED ITEM", lines: ["Great power, at a price. Cursed items never auto-equip; equip it from your bag (C)."], item, tone: "bad", ...back, suspense: 0.8 });
      } else if (roll === "potions") {
        const before = this.player.potions;
        this.player.potions = Math.min(this.stats.potionMax, this.player.potions + 2);
        if (this.player.potions === before) this.heal(this.stats.maxHp * 0.3);
        this.setModal({ kind: "reveal", title: "TWO POTIONS", lines: ["Not cursed at all. Suspicious."], tone: "good", ...back, suspense: 0.8 });
      } else if (roll === "curse") {
        this.addBuff({ id: "boxCurse", name: "Box Rot", kind: "curse", mods: { dmgPct: -15 }, rooms: 2, color: "#7a2cff", icon: "☠" });
        this.setModal({ kind: "reveal", title: "IT WAS A CURSE", lines: ["-15% damage for the next 2 rooms."], tone: "bad", ...back, suspense: 0.8 });
      } else {
        const item = generateItem(this.rng, this.depth, { rarity: "epic" });
        this.acquireItem(item, "merchant", true);
        this.setModal({ kind: "reveal", title: "AN EPIC SURPRISE", lines: [], item, tone: "legendary", ...back, suspense: 0.8 });
      }
    }
  }

  async resolveEvent() {
    const modal = this.modal;
    if (modal.kind !== "event") return;
    const it = this.interactable(modal.id);
    if (!it || it.used) return;
    const def = EVENTS[modal.event];
    if (def.cost > 0 && !(await this.pay(def.cost, titleCase(def.name), "event"))) return;
    it.used = true;
    const reveal = (title: string, lines: string[], tone: Extract<Modal, { kind: "reveal" }>["tone"], extra: Partial<Extract<Modal, { kind: "reveal" }>> = {}) =>
      this.setModal({ kind: "reveal", title, subtitle: def.name, lines, tone, suspense: def.cost >= 25 ? 1.8 : 0.7, ...extra });
    const room = this.floor!.rooms[it.roomId];
    if (modal.event === "gambler") {
      const row = this.rng.table(GAMBLER_PAYOUTS);
      if (row.payout > 0) {
        await this.grant(row.payout, `The Gambler paid ${row.payout} RF`, "event-reward");
        reveal(`YOU WIN ${row.payout} RF`, [row.payout >= 25 ? "The Gambler stares. That never happens." : "The Gambler shrugs and pays."], row.payout >= 10 ? "legendary" : "good", { rf: row.payout });
      } else reveal("YOU LOSE", ["The Gambler pockets your 5 RF with a grin."], "bad");
      return;
    }
    const outcome = this.rng.table(def.outcomes).id;
    switch (outcome) {
      case "heal": this.heal(this.stats.maxHp * 0.3); reveal("THE WATER HEALS", ["+30% HP."], "good"); break;
      case "blessing": this.addBuff({ id: "wellBlessing", name: "Well-Blessed", kind: "blessing", mods: { dmgPct: 12 }, rooms: 3, color: "#3ef0ff", icon: "⚔" }); reveal("A BLESSING", ["+12% damage for the next 3 rooms."], "good"); break;
      case "curse":
        this.addBuff({ id: "rot", name: modal.event === "corpse" ? "Corpse Rot" : "Well Rot", kind: "curse", mods: modal.event === "corpse" ? { dmgPct: -15 } : { damageTakenPct: 20 }, rooms: 2, color: "#7a2cff", icon: "☠" });
        reveal("A CURSE", [modal.event === "corpse" ? "-15% damage for the next 2 rooms." : "+20% damage taken for the next 2 rooms."], "bad");
        break;
      case "smallLoot": case "loot": { const item = generateItem(this.rng, this.depth, { rarity: rollRarity(this.rng, 0.35, "uncommon") }); this.acquireItem(item, "event", true); reveal("LOOT", [], "good", { item }); break; }
      case "nothing": reveal("NOTHING", ["The coins sink. The well keeps them."], "neutral"); break;
      case "revealSecret": { const found = this.revealSecret(); reveal(found ? "A SECRET ROOM" : "THE FLOOR IS REVEALED", [found ? "The Stranger points. A hidden passage grinds open." : "“No secrets here.” The Stranger reveals every room instead."], "good"); break; }
      case "disappear": reveal("THE STRANGER VANISHES", ["…along with your 10 RF."], "bad"); break;
      case "relic": { const item = generateItem(this.rng, this.depth, { slot: "relic", rarity: rollRarity(this.rng, 0.7, "rare") }); this.acquireItem(item, "event", true); reveal("A GIFT", ["“You will need this deeper down.”"], "good", { item }); break; }
      case "summonElite": {
        reveal("AN AMBUSH", ["The Stranger laughs, and something elite steps out of the dark."], "bad");
        this.spawn("corrupted", this.pointNearPlayer(room.id, 160, 240), room.id, { elite: true, mods: rollModifiers(this.rng, Math.min(3, 1 + Math.floor(this.depth / 3))) });
        this.startEncounter(room, { roomId: room.id, waves: [], next: 0, reward: "none" });
        break;
      }
      case "secretBoss": reveal("A SECRET BOSS", ["Behind the door waits THE UNMINTED."], "void", { followUp: "arena-unminted", action: "STEP THROUGH" }); break;
      case "mythicChest": {
        const chest = this.addInteractable({ kind: "chest", pos: { x: it.pos.x + 70, y: it.pos.y + 20 }, radius: 22, roomId: room.id, label: "MYTHIC CHEST",
          chest: { kind: "mythic", minRarity: "legendary", boost: 2, rerolls: 0, rfPaid: true } });
        reveal("A MYTHIC CHEST", ["It hums with impossible light."], "mythic", { followUp: "loot", followId: chest.id, action: "OPEN IT" });
        await this.prepareChest(chest);
        break;
      }
      case "cursedDungeon": reveal("A CURSED DUNGEON", ["The door leads somewhere worse. Survive it for a Legendary hoard."], "void", { followUp: "arena-cursed", action: "DESCEND" }); break;
      case "horde": {
        reveal("THE HORDE", ["An enormous crowd pours through the door.", "Survive for +5 RF and a rich chest."], "bad");
        const n = 6 + this.depth;
        const wave = (count: number): Wave => Array.from({ length: count }, (_, i) => ({ kind: i % 3 === 2 ? "crawler" : "cursed", options: i === 0 ? { champion: true, mods: rollModifiers(this.rng, 1) } : {} } as Wave[number]));
        this.startEncounter(room, { roomId: room.id, waves: [wave(n), wave(n), [{ kind: "corrupted", options: { elite: true, mods: rollModifiers(this.rng, 1) } }, ...wave(Math.ceil(n / 2))]], next: 0, reward: "horde" });
        break;
      }
      case "duplicate": case "destroy": {
        const strongest = SLOTS.map(slot => this.equipment[slot]).filter((item): item is Item => Boolean(item)).sort((a, b) => itemScore(b) - itemScore(a))[0];
        if (!strongest) { reveal("AN EMPTY REFLECTION", ["You carry nothing worth reflecting."], "neutral"); break; }
        if (outcome === "duplicate") {
          const copy: Item = { ...strongest, id: newItemId() };
          this.bag.push(copy);
          this.secured.add(copy.id);
          reveal("DUPLICATED", ["A perfect copy of your strongest item. It is already secured, so you keep it even if you fall."], rarityRank(copy.rarity) >= 4 ? "legendary" : "good", { item: copy });
        } else {
          this.equipment[strongest.slot] = null;
          this.refreshStats();
          reveal("DESTROYED", [`${strongest.name} shatters in the glass.`], "bad", { item: strongest });
        }
        break;
      }
      case "ambush": {
        reveal("AN AMBUSH", ["The corpse was bait."], "bad");
        const wave: Wave = Array.from({ length: 3 + Math.ceil(this.depth / 2) }, (_, i) => ({ kind: i % 2 ? "crawler" : "cursed", options: {} }));
        this.startEncounter(room, { roomId: room.id, waves: [wave], next: 0, reward: "none" });
        break;
      }
      case "rf": await this.grant(RF_REWARDS.corpseFind, "Found on The Corpse", "event-reward"); reveal(`+${RF_REWARDS.corpseFind} RF`, ["A few coins in a clenched hand."], "good", { rf: RF_REWARDS.corpseFind }); break;
      case "epicPlus": {
        const rarity = this.rng.table(GOLDEN_DOOR_RARITIES).rarity;
        const item = generateItem(this.rng, this.depth, { rarity });
        this.acquireItem(item, "event", true);
        reveal(`${RARITY_STYLE[rarity].label} REWARD`, ["The Golden Door keeps its promise."], rarity === "mythic" ? "mythic" : "legendary", { item });
        break;
      }
      case "gift":
        this.heal(this.stats.maxHp * 0.25);
        await this.grant(RF_REWARDS.rareEvent, "A Lost Friend's gift", "event-reward");
        reveal(`+${RF_REWARDS.rareEvent} RF`, ["The lost Friend finds its way home, leaving warmth and a gift behind."], "good", { rf: RF_REWARDS.rareEvent });
        break;
    }
  }

  private async openChest(chest: Interactable) {
    if (!chest.chest) return;
    await this.prepareChest(chest);
    this.sfx("pickup");
    this.audio.cue("action-ready");
    this.setModal({ kind: "loot", id: chest.id });
  }

  private async prepareChest(chest: Interactable) {
    const c = chest.chest!;
    if (!c.rfPaid && c.kind === "treasure") {
      c.rfPaid = true;
      await this.grant(RF_REWARDS.treasureRoom, "Treasure room", "treasure");
    }
    if (!c.options) c.options = this.rollChestOptions(c);
  }

  private rollChestOptions(c: NonNullable<Interactable["chest"]>): Item[] {
    let min = c.minRarity;
    const run = this.run;
    if (run?.nextChestMin && rarityRank(run.nextChestMin) > rarityRank(min)) { min = run.nextChestMin; run.nextChestMin = null; this.toast("Fate's promise: Rare or better", "#4fb0ff"); }
    const boost = this.depth * 0.08 + this.stats.luck / 100 + c.boost;
    const options: Item[] = [];
    const slots = this.rng.shuffle([...SLOTS]);
    for (let i = 0; i < 3; i++) {
      let rarity = rollRarity(this.rng, boost, min);
      if (c.kind === "mythic" && i === 0) rarity = "mythic";
      options.push(generateItem(this.rng, this.depth, { rarity, slot: slots[i], cursed: c.kind === "cursed" && i === 2 }));
    }
    return options;
  }

  chestOf(id: number) { return this.interactable(id)?.chest; }

  async rerollLoot() {
    const modal = this.modal;
    if (modal.kind !== "loot") return;
    const chest = this.interactable(modal.id)?.chest;
    if (!chest || chest.rerolls >= RF_COSTS.reroll.length) return;
    const cost = RF_COSTS.reroll[chest.rerolls];
    if (!(await this.pay(cost, `Loot reroll #${chest.rerolls + 1}`, "reroll"))) return;
    chest.rerolls++;
    chest.options = this.rollChestOptions(chest);
    this.audio.cue("anticipation");
    this.patch({});
  }

  chooseLoot(index: number) {
    const modal = this.modal;
    if (modal.kind !== "loot") return;
    const it = this.interactable(modal.id);
    const item = it?.chest?.options?.[index];
    if (!it || !item) return;
    it.used = true;
    this.setModal({ kind: "none" });
    this.acquireItem(item, "chest");
  }

  async revive(kind: ReviveKind) {
    if (this.modal.kind !== "death") return;
    const cost = RF_COSTS.revive[kind];
    if (!(await this.pay(cost, kind === "full" ? "Full revival" : "Revive", "revive"))) return;
    const p = this.player;
    p.dead = false;
    p.hp = this.stats.maxHp * (kind === "full" ? 1 : 0.4);
    p.iframes = kind === "full" ? 3 : 2;
    p.energy = this.stats.energyMax;
    if (kind === "full") { this.buffs = this.buffs.filter(b => b.kind !== "curse"); this.refreshStats(); }
    this.projectiles = this.projectiles.filter(proj => proj.owner === "player");
    this.hazards = this.hazards.filter(h => h.owner === "player");
    this.hazard({ shape: "circle", pos: { ...p.pos }, radius: 260, delay: 0, dmg: kind === "full" ? this.stats.atk * 2 : 0, owner: "player", color: "#ccff00", knock: 520 });
    this.particle({ x: p.pos.x, y: p.pos.y - 10, vx: 0, vy: 0, life: 0.6, size: 260, color: "#ccff00", kind: "ring", drag: 0, gravity: 0 });
    this.burst(p.pos.x, p.pos.y - 16, "#ccff00", 60, 320);
    this.audio.cue("reveal-rare");
    this.audio.setMusicMode(this.boss ? "boss" : this.placeMusic());
    this.refreshRoomMusic();
    this.setModal({ kind: "none" });
    this.toast(kind === "full" ? "FULL REVIVAL" : "REVIVED", "#ccff00");
  }

  endRunFromDeath() { if (this.modal.kind === "death") this.endRun("fallen"); }
  abandonRun() { if (this.run) this.endRun("abandoned"); }

  waystoneDescend() { if (this.modal.kind === "waystone") { this.setModal({ kind: "none" }); this.nextFloor(); } }
  /** How escaping right now would be scored. */
  get escapeOutcome(): ScoreOutcome { return this.run?.beastDefeated ? "conquered" : "escaped"; }
  waystoneEscape() { if (this.modal.kind === "waystone") this.endRun(this.run?.beastDefeated ? "conquered" : "escaped"); }

  private secureLoot() {
    let count = 0;
    for (const item of this.allCarried()) if (!this.secured.has(item.id)) { this.secured.add(item.id); count++; }
    if (count) this.toast(`${count} item${count === 1 ? "" : "s"} secured`, "#ccff00");
    this.audio.cue("reward");
  }

  private nextFloor() {
    this.sfx("doorOpen");
    this.enterFloor(this.depth + 1);
  }

  // ─── Pocket arenas ─────────────────────────────────────────────────────────

  private enterArena(kind: "unminted" | "cursed") {
    const floor = this.floor!;
    this.saved = { floor, pos: { ...this.player.pos }, interactables: this.interactables, pickups: this.pickups, room: this.currentRoom };
    const arena = generateArena(this.depth, hash32(this.runSeed ^ 0xabc ^ this.depth), kind === "unminted" ? 30 : 32, 22);
    this.floor = arena;
    this.audio.setRoomSong(null);
    this.enemies = []; this.projectiles = []; this.hazards = []; this.pickups = []; this.interactables = []; this.floaters = [];
    this.player.pos = { ...arena.start };
    this.currentRoom = 0;
    this.renderer?.floorChanged();
    const room = arena.rooms[0];
    if (kind === "unminted") {
      this.lockedRoom = 0;
      this.recomputeBarriers();
      const boss = this.spawn("unminted", { x: roomCenter(room).x, y: roomCenter(room).y - 80 }, 0);
      this.boss = boss;
      this.encounter = { roomId: 0, waves: [], next: 0, reward: "none" };
      this.audio.setMusicMode("boss");
      this.sfx("roar");
      this.banner("THE UNMINTED", `${this.friend.label} vs a Friend that was never minted`, "#ff3d7f", "boss");
    } else {
      const eliteMods = Math.min(3, 1 + Math.floor(this.depth / 3));
      const wave = (n: number): Wave => Array.from({ length: n }, (_, i) => ({ kind: i % 3 === 1 ? "crawler" : "cursed", options: { champion: i % 2 === 0, mods: i % 2 === 0 ? rollModifiers(this.rng, 1) : undefined } }));
      this.startEncounter(room, { roomId: 0, waves: [wave(6 + this.depth), [{ kind: "corrupted", options: { elite: true, mods: rollModifiers(this.rng, eliteMods) } }, ...wave(4)]], next: 0, reward: "arena" });
      this.banner("THE CURSED DUNGEON", "Survive. The hoard is Legendary.", "#7a2cff", "boss");
    }
  }

  private returnFromArena() {
    const saved = this.saved;
    if (!saved) return;
    // Carry anything left behind in the arena back out.
    for (const pickup of this.pickups) if (pickup.kind === "item" && pickup.item) this.acquireItem(pickup.item, "found");
    for (const pickup of this.pickups) if (pickup.kind === "rf") void this.grant(pickup.amount ?? 1, pickup.reason ?? "RF", pickup.category ?? "enemy");
    this.floor = saved.floor;
    this.interactables = saved.interactables;
    this.pickups = saved.pickups;
    this.player.pos = saved.pos;
    this.currentRoom = saved.room;
    this.enemies = []; this.projectiles = []; this.hazards = []; this.boss = null; this.encounter = null; this.lockedRoom = null;
    this.saved = null;
    this.recomputeBarriers();
    this.renderer?.floorChanged();
    this.audio.setMusicMode(this.placeMusic());
    this.toast("You return from the rift.", "#ccff00");
  }

  // ─── Items and stats ───────────────────────────────────────────────────────

  allCarried(): Item[] {
    return [...SLOTS.map(slot => this.equipment[slot]).filter((item): item is Item => Boolean(item)), ...this.bag];
  }

  private discover(item: Item) {
    const key = item.power ?? `${item.rarity}:${item.name}`;
    const entry = this.codex.get(key);
    if (entry) entry.count++;
    else this.codex.set(key, { name: item.name, rarity: item.rarity, slot: item.slot, count: 1 });
    if (this.run && (!this.run.rarest || itemScore(item) > itemScore(this.run.rarest))) this.run.rarest = item;
  }

  /** Equip if better (never auto-equip cursed items), otherwise bag it. `quiet` skips the toast when a reveal shows it. */
  acquireItem(item: Item, _source: string, quiet = false) {
    this.discover(item);
    const current = this.equipment[item.slot];
    const style = RARITY_STYLE[item.rarity];
    let verb: string;
    if (!item.cursed && (!current || itemScore(item) > itemScore(current))) {
      this.equipment[item.slot] = item;
      if (current) this.bagItem(current);
      this.refreshStats();
      verb = "EQUIPPED";
    } else {
      this.bagItem(item);
      verb = "BAGGED";
    }
    this.sfx("pickup");
    if (rarityRank(item.rarity) >= 4) {
      this.audio.cue("reveal-legendary");
      this.burst(this.player.pos.x, this.player.pos.y - 20, style.color, 70, 320);
      if (!quiet) this.banner(`${style.label}`, item.name, style.color, "loot");
    } else if (rarityRank(item.rarity) >= 2) this.audio.cue("reveal-rare");
    else this.audio.cue("reveal-common");
    if (!quiet) this.toast(`${verb}: ${item.name}`, style.color);
    this.patch({});
  }

  private bagItem(item: Item) {
    this.bag.push(item);
    if (this.bag.length > BAG_LIMIT) {
      const worst = [...this.bag].sort((a, b) => itemScore(a) - itemScore(b))[0];
      this.bag = this.bag.filter(i => i !== worst);
      this.toast(`Bag full: dropped ${worst.name}`, "#9a93ad");
    }
  }

  equipFromBag(id: number) {
    const item = this.bag.find(i => i.id === id);
    if (!item) return;
    const current = this.equipment[item.slot];
    this.bag = this.bag.filter(i => i.id !== id);
    this.equipment[item.slot] = item;
    if (current) this.bag.push(current);
    this.refreshStats();
    this.sfx("pickup");
    this.patch({});
  }

  destroyBagItem(id: number) {
    this.bag = this.bag.filter(i => i.id !== id);
    this.secured.delete(id);
    this.sfx("deny");
    this.patch({});
  }

  private addBuff(buff: Buff) {
    this.buffs = [...this.buffs.filter(b => b.id !== buff.id), buff];
    this.refreshStats();
  }

  refreshStats() {
    const before = this.stats?.maxHp ?? 100;
    this.stats = computeStats(this.level, this.trait.mods, this.boons, SLOTS.map(s => this.equipment[s]).filter((i): i is Item => Boolean(i)), this.buffs);
    const p = this.player;
    if (this.stats.maxHp > before) p.hp += this.stats.maxHp - before;
    p.hp = Math.min(p.hp, this.stats.maxHp);
    p.potions = Math.min(p.potions, this.stats.potionMax);
  }

  private revealFloor(includeSecret: boolean) {
    for (const room of this.floor?.rooms ?? []) if (room.type !== "secret" || includeSecret) { room.known = true; room.revealed = true; }
  }

  private revealSecret(): boolean {
    const floor = this.floor!;
    const c = floor.connections.find(c => c.kind === "secret" && !c.open);
    if (!c) { this.revealFloor(false); return false; }
    this.openSecret(c.id);
    floor.rooms[c.b].revealed = true;
    return true;
  }

  // ─── Run end ───────────────────────────────────────────────────────────────

  private endRun(outcome: RunSummary["outcome"]) {
    const run = this.run;
    if (!run) return;
    const carried = this.allCarried();
    const kept = outcome === "escaped" || outcome === "conquered" ? carried : carried.filter(item => this.secured.has(item.id));
    const starter = this.equipment.weapon?.name === "Rune Claw" && this.equipment.weapon.rarity === "common" ? this.equipment.weapon.id : -1;
    const toStash = kept.filter(item => item.id !== starter);
    this.stash = [...toStash, ...this.stash].sort((a, b) => itemScore(b) - itemScore(a)).slice(0, STASH_LIMIT);
    const history = this.economy.getHistory();
    const score = this.scoreFor(outcome, carried);
    this.lifetimeScore += score.total;
    const best = score.total > this.bestScore;
    if (best) this.bestScore = score.total;
    const summary: RunSummary = {
      outcome, friendLabel: this.friend.label, family: this.friend.family, depth: this.depth, kills: run.kills, elites: run.elites,
      bosses: [...run.bosses], rarest: run.rarest, rfStarted: run.rfStart, rfEarned: run.rfEarned, rfSpent: run.rfSpent,
      rfRemaining: wholeRf(this.economy.getBalance()), timeMs: performance.now() - run.started, level: this.level,
      secured: toStash.length, lost: carried.length - kept.length, seed: run.seed,
      transactions: history.slice(run.firstTx).filter(tx => tx.category !== "stipend"),
      score, lifetimeScore: this.lifetimeScore, best,
    };
    this.hall.push(summary);
    this.hall.sort((a, b) => b.score.total - a.score.total || b.depth - a.depth);
    this.hall.splice(5);
    this.run = null;
    this.resetFloorEntities();
    this.floor = null;
    this.audio.setRoomSong(null);
    this.audio.setMusicMode("none");
    this.audio.cue(outcome === "fallen" || outcome === "abandoned" ? "impact" : "reveal-legendary");
    this.patch({ screen: "summary", modal: { kind: "none" }, summary, banner: null, pendingLevels: 0, toasts: [] });
  }

  /** Score for the run so far, as if it ended now with `outcome`. */
  scoreFor(outcome: ScoreOutcome, items: readonly Item[] = this.allCarried()): RunScore {
    const run = this.run;
    return scoreRun({ depth: this.depth, kills: run?.kills ?? 0, elites: run?.elites ?? 0, bosses: run?.bosses ?? [], level: this.level, items, rfEarned: run?.rfEarned ?? 0, outcome });
  }

  // ─── Effects and camera ────────────────────────────────────────────────────

  private updateEffects(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vy = p.vy * drag + p.gravity * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const c of this.corpses) c.t -= dt;
    if (this.corpses.length) this.corpses = this.corpses.filter(c => c.t > 0);
    for (const f of this.floaters) { f.life -= dt; f.y += f.vy * dt; f.vy *= Math.exp(-dt * 3); }
    this.floaters = this.floaters.filter(f => f.life > 0);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 30);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const look = this.reducedMotion ? { x: 0, y: 0 } : fromAngle(p.aim, 36);
    const target = { x: p.pos.x + look.x - 480, y: p.pos.y + look.y - 330 };
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    this.camera.x += (target.x - this.camera.x) * k;
    this.camera.y += (target.y - this.camera.y) * k;
  }

  /** Test and debug view of the run, exposed only to automated browsers. */
  debugState() {
    return {
      screen: this.screen, modal: this.modal.kind, depth: this.depth, hp: Math.round(this.player.hp), maxHp: this.stats.maxHp,
      level: this.level, balance: wholeRf(this.economy.getBalance()), enemies: this.enemies.length, locked: this.lockedRoom,
      room: this.currentRoom === null ? null : this.floor?.rooms[this.currentRoom]?.type ?? null, pos: { ...this.player.pos },
      interactables: this.interactables.map(it => ({ id: it.id, kind: it.kind, label: it.label, used: it.used, x: it.pos.x, y: it.pos.y, room: it.roomId })),
      rooms: this.floor?.rooms.map(r => ({ id: r.id, type: r.type, cleared: r.cleared, x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE })) ?? [],
      equipment: SLOTS.map(slot => this.equipment[slot]?.name ?? null), bag: this.bag.length, potions: this.player.potions,
      history: this.economy.getHistory().map(tx => ({ kind: tx.kind, amount: wholeRf(tx.amount), reason: tx.reason, category: tx.category })),
      stash: this.stash.length, dead: this.player.dead, boss: this.boss ? { name: this.boss.name, hp: this.boss.hp, phase: this.boss.phase } : null,
      drops: this.pickups.map(p => ({ kind: p.kind, x: p.pos.x, y: p.pos.y, rarity: p.item?.rarity ?? null })),
      foes: this.enemies.map(e => ({ id: e.id, kind: e.kind, name: e.name, x: e.pos.x, y: e.pos.y, hp: e.hp, spawning: e.spawnT > 0 })),
      pickups: this.pickups.length, particles: this.particles.length, settings: this.settings, pendingLevels: this.ui.pendingLevels,
      score: this.run ? this.scoreFor("running").total : 0, lifetimeScore: this.lifetimeScore, roomSong: this.audio.currentRoomSong,
      worn: { ...this.worn }, owned: [...this.ownedCosmetics],
    };
  }

  /** Automated-browser helpers. Never reachable from gameplay input. */
  debugTeleport(x: number, y: number) { this.player.pos = { x, y }; this.camera = { x: x - 480, y: y - 330 }; }
  debugKillRoom() { for (const e of this.enemies) if (!e.dead && e.kind !== "goblin") this.dealDamage(e, 1e7, { source: "nova" }); for (const e of this.enemies) if (!e.dead) this.killEnemy(e); }
  debugDamagePlayer(amount: number) { this.player.iframes = 0; this.hurtPlayer(amount / Math.max(0.01, (1 - this.stats.armor / (this.stats.armor + 100)) * this.stats.damageTaken), null, { certain: true }); }
  debugNextFloor() { if (this.run) this.nextFloor(); }
  debugXp(amount: number) { this.gainXp(amount); }
  debugGiveItems(count: number) {
    for (let i = 0; i < count; i++) this.acquireItem(generateItem(this.rng, this.depth + 2, { slot: SLOTS[i % SLOTS.length], rarity: RARITIES[Math.min(5, (i * 7) % 6)], cursed: i === 7 }), "debug", true);
  }
  debugGrant(amount: number) { return this.economy.reward(rf(amount), "Test grant (automated test)", "stipend"); }
  debugSpawn(kind: EnemyKind) { const room = this.lockedRoom ?? this.currentRoom ?? 0; return this.spawn(kind, this.pointNearPlayer(room, 120, 220), room).id; }
}

function freshPlayer(pos: Vec): Player {
  return {
    pos: { ...pos }, vel: { x: 0, y: 0 }, radius: PLAYER_RADIUS, hp: 100, energy: 100, level: 1, xp: 0, potions: 2,
    aim: Math.PI / 2, facing: "down", side: "right", moving: false, walkTime: 0,
    attackCd: 0, boltCd: 0, novaCd: 0, dodgeCd: 0, dodgeCharges: 2, critT: 0, potionCd: 0, dashTime: 0, dashDir: { x: 0, y: 0 }, iframes: 0,
    combo: 0, comboTimer: 0, swing: null, strikes: 0, hitFlash: 0, chill: 0, weakened: 0, orbit: 0, dead: false, deathTime: 0, trailT: 0,
  };
}

const PRISM = ["#ff3d7f", "#ff9a3c", "#ffd23c", "#ccff00", "#6ee07a", "#3ef0ff", "#4fb0ff", "#bb66ff"] as const;

function isFightRoom(room: Room) { return room.type === "combat" || room.type === "elite" || room.type === "bonus" || room.type === "boss"; }
const SMALL_WORDS = new Set(["of", "the", "a", "to"]);
export function titleCase(text: string) {
  return text.toLowerCase().split(" ").map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/(^|-)\S/g, m => m.toUpperCase()))).join(" ");
}
